<#
==============================================================================
 RK Clinic LIS -- one-shot Windows setup
==============================================================================
 Run ONCE on the lab machine, as Administrator, AFTER the installer has run.

   powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -ServiceUser labuser

 It does the four things that would otherwise be hand-work, and each of them is
 something that fails quietly when done by hand:

   1. writes the credentials file, generating the two secrets itself so nobody
      reuses a development key or invents a weak one
   2. registers the background service to start at boot, under the right user
      account rather than SYSTEM
   3. opens the firewall for the LIS and the analyzers, on the Private profile
   4. stops the machine sleeping, which would drop serial handles and listeners

 It does NOT install MySQL. That is a separate download, and it must be 8.4 LTS
 rather than 9.x.

 It does NOT create the database either, and the order matters: run the schema
 file FIRST, as root, then this script.

   cmd /c "mysql -u root -p < \"C:\Program Files\RK Clinic LIS\rk-clinic-schema.sql\""

 PowerShell has no '<' redirection operator, so cmd has to do it.

 That file ships alongside the app from 0.3.1 onwards. It creates the schema, the
 staff accounts, and the low-privilege MySQL account the app connects as. This
 script then reads that account's password straight out of the schema file, so a
 23-character credential never has to be retyped.

 This script has not been executed on Windows from the build machine, so read it
 before running it and expect to adjust paths if the install location differs.
==============================================================================
#>

[CmdletBinding()]
param(
  # The account the service runs as. Its profile is where the config is written,
  # so this must be the account the lab actually uses.
  [Parameter(Mandatory = $true)]
  [string]$ServiceUser,

  # Needed only if the scheduled task must run while that user is logged off.
  [string]$ServicePassword,

  [string]$InstallDir = 'C:\Program Files\RK Clinic LIS',
  [string]$MysqlHost = 'localhost',
  [int]$MysqlPort = 3306,
  [string]$MysqlUser = 'rk_lis',
  [string]$MysqlDatabase = 'rk_clinic',

  # Read from the schema file if omitted, and prompted for only if that fails, so
  # it never has to appear in a command history.
  [string]$MysqlPassword,

  # The schema file the installer places next to the app. Used to recover the
  # application account's generated password rather than asking someone to copy
  # it by hand.
  [string]$SchemaFile,

  [int]$WebPort = 3000,

  # Restrict web access to the Tailscale range (100.64.0.0/10) instead of opening
  # the port to the whole local network. Use this when the hospital reaches this
  # machine over a VPN rather than from the same LAN -- it means a stranger on the
  # lab's wifi cannot open the LIS, while the hospital still can.
  [switch]$TailnetOnly,

  # Skip individual steps when re-running after a partial setup.
  [switch]$SkipFirewall,
  [switch]$SkipTask,
  [switch]$SkipPower
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n=== $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  [ok] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  [!!] $m" -ForegroundColor Yellow }

<#
  Run a console program and hand back its exit code, tolerating whatever it
  writes to stderr.

  This is not defensive padding, it is required. While $ErrorActionPreference is
  'Stop', Windows PowerShell turns a native command's stderr output into a
  terminating error, and redirecting with *> $null does NOT prevent it. Several
  of the programs below use stderr to report the ordinary "nothing there" case:

    schtasks /query   for a task that does not exist yet
    netsh delete rule when there is no such rule

  On a first install both are the normal path, so the script died at the first
  schtasks call on every clean machine. Relaxing the preference around the native
  call only, rather than for the whole script, keeps cmdlet failures fatal.
#>
function Invoke-Native {
  param(
    [Parameter(Mandatory)] [string]   $Exe,
    [Parameter(Mandatory)] [string[]] $Arguments,
    # Show what the program printed. Off by default because these calls are
    # probes whose output is noise when things are working.
    [switch] $Show
  )

  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Exe @Arguments 2>&1
    $exit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }

  if ($Show -and $output) {
    foreach ($line in $output) { Write-Host "       $line" -ForegroundColor DarkGray }
  }
  return $exit
}

# -- Preconditions -----------------------------------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  throw 'Run this in an Administrator PowerShell. Registering a boot task and firewall rules both require it.'
}

$serviceLauncher = Join-Path $InstallDir 'resources\app\build\service.cmd'
if (-not (Test-Path $serviceLauncher)) {
  throw "Cannot find $serviceLauncher -- install the app first, or pass -InstallDir with the real location."
}
Write-Ok "found the app at $InstallDir"

# -- 1. Credentials ----------------------------------------------------------
# Written into the SERVICE USER's profile, not the administrator's. This is the
# trap the manual process falls into: an elevated shell has its own APPDATA, so
# a config written with $env:APPDATA lands where the service will never look.

Write-Step 'Credentials'

$userProfile = "C:\Users\$ServiceUser"
if (-not (Test-Path $userProfile)) {
  throw "No profile at $userProfile. The account must have logged in at least once."
}

$dataDir = Join-Path $userProfile 'AppData\Roaming\rk-clinic'
$envFile = Join-Path $dataDir '.env.local'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not $SchemaFile) {
  $SchemaFile = Join-Path $InstallDir 'rk-clinic-schema.sql'
}

# The schema file created this account, so it is also the only place its password
# is written down. Reading it here beats asking someone to transcribe 23
# characters from a terminal on another machine.
if (-not $MysqlPassword -and (Test-Path $SchemaFile)) {
  $pattern = "CREATE USER IF NOT EXISTS '" + [regex]::Escape($MysqlUser) +
             "'@'localhost' IDENTIFIED BY '([^']+)'"
  $found = [regex]::Match((Get-Content -Raw -Path $SchemaFile), $pattern)
  if ($found.Success) {
    $MysqlPassword = $found.Groups[1].Value
    Write-Ok "recovered the '$MysqlUser' password from $(Split-Path -Leaf $SchemaFile)"
  } else {
    Write-Warn "no CREATE USER for '$MysqlUser' in $SchemaFile -- was the schema built before 0.3.1?"
  }
}

if (-not $MysqlPassword) {
  $secure = Read-Host "MySQL password for '$MysqlUser'" -AsSecureString
  $MysqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

# -- Prove the database is reachable before writing anything ------------------
# This is the failure that cost the most time on 0.3.0: the config named an
# account that had never been created, so the pool could not connect and every
# page returned 500 with nothing on the machine explaining why. Checking it here
# turns that into one clear message at setup time.

$mysqlExe = (Get-Command mysql.exe -ErrorAction SilentlyContinue).Source
if (-not $mysqlExe) {
  $found = Get-ChildItem -Path 'C:\Program Files\MySQL' -Filter mysql.exe `
    -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $mysqlExe = $found.FullName }
}

if ($mysqlExe) {
  # PowerShell 7.4+ turns a non-zero exit from a native command into a
  # terminating error while ErrorActionPreference is Stop, which would abort with
  # a generic message instead of the specific one below. Windows PowerShell 5.1,
  # which the documented command line uses, has no such variable.
  if (Test-Path Variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
  }

  # Passed by environment, not on the command line, so the password does not
  # appear in the process list or trigger mysql's own insecure-argument warning.
  $env:MYSQL_PWD = $MysqlPassword
  try {
    $probe = & $mysqlExe "--host=$MysqlHost" "--port=$MysqlPort" "--user=$MysqlUser" `
      "--database=$MysqlDatabase" '--batch' '--skip-column-names' `
      '--execute=SELECT COUNT(*) FROM user_profiles' 2>&1
    $probeFailed = $LASTEXITCODE -ne 0
  } finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  }

  if ($probeFailed) {
    Write-Warn "could not query '$MysqlDatabase' as '$MysqlUser':"
    Write-Warn "   $probe"
    throw ("Stopping before writing a config that cannot work. Apply the schema " +
           "first, as root:`n    cmd /c `"mysql -u root -p < '$SchemaFile'`"")
  }
  Write-Ok "database reachable as '$MysqlUser' -- $(($probe | Out-String).Trim()) staff account(s) found"
} else {
  Write-Warn 'mysql.exe not found, so these credentials were NOT verified.'
  Write-Warn 'If the LIS returns 500 on every page, this is the first thing to check.'
}

# 32 bytes of cryptographic randomness, hex encoded. Generated here so that no
# installation shares a secret with another, or with the development machine.
function New-Secret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

if (Test-Path $envFile) {
  Write-Warn "$envFile already exists -- leaving it alone. Delete it and re-run to regenerate."
} else {
  $content = @"
# RK Clinic LIS -- generated by setup-windows.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# Secrets below are unique to this installation. Do not copy them elsewhere.

MYSQL_HOST=$MysqlHost
MYSQL_PORT=$MysqlPort
MYSQL_DATABASE=$MysqlDatabase
MYSQL_USER=$MysqlUser
MYSQL_PASSWORD=$MysqlPassword

JWT_SECRET=$(New-Secret)
LIS_ANALYZER_API_KEY=$(New-Secret)
"@
  Set-Content -Path $envFile -Value $content -Encoding UTF8

  # Readable only by that user and administrators: it holds the database password
  # and the key every analyzer bridge authenticates with.
  $acl = Get-Acl $envFile
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
    $ServiceUser, 'FullControl', 'Allow')))
  $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
    'Administrators', 'FullControl', 'Allow')))
  Set-Acl -Path $envFile -AclObject $acl

  Write-Ok "wrote $envFile with freshly generated secrets"
}

# -- 2. Start at boot --------------------------------------------------------

if (-not $SkipTask) {
  Write-Step 'Background service'

  $taskName = 'RK Clinic LIS'

  # Registered with the ScheduledTasks cmdlets rather than schtasks.exe.
  # schtasks wants the program path quoted inside its /tr value, because the path
  # contains spaces, and getting a quoted-inside-quoted argument through
  # PowerShell's native argument handling intact is unreliable: it arrives split,
  # and schtasks answers "Invalid argument/option - 'C:\Program'." The cmdlets
  # take the path as an ordinary string and do their own quoting, so the whole
  # problem disappears.
  $action  = New-ScheduledTaskAction -Execute $serviceLauncher
  $trigger = New-ScheduledTaskTrigger -AtStartup

  # Meant to behave like a service: start on battery, never time out, and come
  # back if the supervisor dies.
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Warn 'task already exists -- replacing it'
  }

  if ($ServicePassword) {
    # A stored password is what lets the task run with nobody logged in.
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Settings $settings -User $ServiceUser -Password $ServicePassword `
      -RunLevel Highest -Force | Out-Null
  } else {
    $principal = New-ScheduledTaskPrincipal -UserId $ServiceUser -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal -Force | Out-Null
  }

  # Read it back rather than trusting the call: a task that was not created is
  # the difference between a machine that comes up after a power cut and one that
  # does not.
  $registered = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $registered) { throw "the task '$taskName' is not there after registering it." }

  Write-Ok "registered '$taskName' to start at boot as $ServiceUser (state: $($registered.State))"
  if (-not $ServicePassword) {
    Write-Warn 'no password given, so the task runs only when that user is logged in.'
    Write-Warn 'For an unattended machine, re-run with -ServicePassword.'
  }
}

# -- 3. Firewall -------------------------------------------------------------
# Without these the analyzers cannot dial in and no other machine can open the
# LIS. 3306 is deliberately absent: the database is reached only from this host.

if (-not $SkipFirewall) {
  Write-Step 'Firewall'

  # The analyzer ports are always LAN-local: the instruments sit on a directly
  # cabled segment and dial in from there. Only the web port is reached from the
  # other site, so only it needs widening -- and widening it as little as possible.
  $rules = @(
    @{ Name = 'RK LIS Hemat 60';    Port = 8080; Scope = 'private' },
    @{ Name = 'RK LIS Mispa Plus';  Port = 8888; Scope = 'private' }
  )

  # Delete first so re-running replaces a rule instead of stacking duplicates.
  # On a first install the delete finds nothing and says so on stderr, which is
  # why it goes through Invoke-Native.
  foreach ($rule in $rules) {
    Invoke-Native netsh @('advfirewall', 'firewall', 'delete', 'rule',
      "name=$($rule.Name)") | Out-Null

    $added = Invoke-Native netsh @('advfirewall', 'firewall', 'add', 'rule',
      "name=$($rule.Name)", 'dir=in', 'action=allow', 'protocol=TCP',
      "localport=$($rule.Port)", 'profile=private') -Show

    if ($added -ne 0) { throw "netsh could not add the rule for TCP $($rule.Port)." }
    Write-Ok "allowed inbound TCP $($rule.Port) from the local network -- $($rule.Name)"
  }

  Invoke-Native netsh @('advfirewall', 'firewall', 'delete', 'rule',
    'name=RK LIS web') | Out-Null

  if ($TailnetOnly) {
    # 100.64.0.0/10 is the CGNAT range Tailscale assigns. Any profile, because a
    # VPN adapter is often classified Public and a Private-only rule would not
    # apply to it -- but restricted by source address, which is tighter than a
    # profile rule anyway.
    $added = Invoke-Native netsh @('advfirewall', 'firewall', 'add', 'rule',
      'name=RK LIS web', 'dir=in', 'action=allow', 'protocol=TCP',
      "localport=$WebPort", 'remoteip=100.64.0.0/10') -Show
    if ($added -ne 0) { throw "netsh could not add the web rule for TCP $WebPort." }
    Write-Ok "allowed inbound TCP $WebPort from the Tailscale range only (100.64.0.0/10)"
  } else {
    $added = Invoke-Native netsh @('advfirewall', 'firewall', 'add', 'rule',
      'name=RK LIS web', 'dir=in', 'action=allow', 'protocol=TCP',
      "localport=$WebPort", 'profile=private') -Show
    if ($added -ne 0) { throw "netsh could not add the web rule for TCP $WebPort." }
    Write-Ok "allowed inbound TCP $WebPort from the local network"
    Write-Warn 'If the hospital connects over a VPN, re-run with -TailnetOnly for a tighter rule.'
  }

  $public = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
  if ($public) {
    Write-Warn 'These adapters are classified Public, so the rules above do NOT apply to them:'
    $public | ForEach-Object { Write-Warn "   $($_.InterfaceAlias)" }
    Write-Warn 'If an analyzer is on one of them, set it to Private:'
    Write-Warn '   Set-NetConnectionProfile -InterfaceAlias "<name>" -NetworkCategory Private'
  }
}

# -- 4. Never sleep ----------------------------------------------------------
# A sleeping host drops serial handles and TCP listeners exactly like a shutdown,
# and an instrument that transmits into it loses that result for good.

if (-not $SkipPower) {
  Write-Step 'Power'
  foreach ($timeout in @('standby-timeout-ac', 'hibernate-timeout-ac', 'disk-timeout-ac')) {
    if ((Invoke-Native powercfg @('/change', $timeout, '0') -Show) -ne 0) {
      # Not fatal. A machine that still sleeps is a problem to fix, but it is not
      # a reason to abandon a setup that has already configured everything else.
      Write-Warn "powercfg could not set $timeout; set it by hand in Power Options."
    }
  }
  Write-Ok 'sleep, hibernate and disk timeout disabled on AC power'
}

# -- What is left ------------------------------------------------------------

Write-Step 'Still to do, by hand'
Write-Host @"
  0. If the hospital is at another site, install Tailscale on this machine and on
     each machine there, then serve the LIS over it with TLS:
       tailscale serve --bg https / http://127.0.0.1:$WebPort
     Staff then open https://<this-machine>.<tailnet>.ts.net with a real
     certificate, instead of sending passwords over plain HTTP.

  1. If the schema step was skipped, do it now as root and re-run this script:
       cmd /c "mysql -u root -p < '$SchemaFile'"
     Then set bind-address=127.0.0.1 in my.ini and restart MySQL, so nothing off
     this machine can reach the database directly.

  2. Give the analyzer-side network adapter the address 192.168.1.3, so the
     instruments need no reconfiguring.

  3. Schedule a mysqldump to somewhere off this machine. Every patient record
     lives here and nowhere else.

  Then reboot, and check:
    - http://127.0.0.1:$WebPort/api/health  returns 200
    - the tray icon shows the analyzer tiles live
    - another PC on the LAN can open http://<this-machine-ip>:$WebPort
"@ -ForegroundColor Gray

Write-Host "`nSetup complete.`n" -ForegroundColor Green
