"use client";

import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';

export default function LoginPage() {
  const { login } = useClinic();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('admin');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password flow states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Role details with preset credentials for autofill
  const roles = [
    {
      id: 'admin',
      name: 'Administrator',
      userPrefill: 'admin@rkclinic.com',
      passPrefill: 'admin@123',
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
          <path d="M8 14.5c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5" />
        </svg>
      )
    },
    {
      id: 'doctor',
      name: 'Doctor',
      userPrefill: 'doc@rkclinic.com',
      passPrefill: 'doc@123',
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.8 2.3A.3.3 0 1 0 5 2a.3.3 0 0 0-.2.3Z" />
          <path d="M3 2h4M17 2h4" />
          <path d="M5 2v9a7 7 0 0 0 14 0V2" />
          <path d="M12 18v2a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-4" />
          <circle cx="19" cy="14" r="2" />
        </svg>
      )
    },
    {
      id: 'technician',
      name: 'Laboratory Technician',
      userPrefill: 'lab@rkclinic.com',
      passPrefill: 'lab@123',
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18h8M3 22h18" />
          <path d="M12 18a6 6 0 0 0 6-6V7" />
          <path d="M9 10h6" />
          <path d="M12 10v3" />
          <rect x="10" y="2" width="4" height="6" rx="1" />
        </svg>
      )
    }
  ];

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
    const r = roles.find(item => item.id === roleId);
    if (r) {
      setUsername(r.userPrefill);
      setPassword(r.passPrefill);
    }
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    const success = await login(username, password, selectedRole);
    if (!success) {
      setErrorMsg('Invalid email or password. Please verify your credentials.');
    } else {
      setErrorMsg('');
    }
  };

  const handleForgotPasswordSubmit = (e) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetSent(true);
  };

  return (
    <div className="login-page-wrapper">
      
      {/* Styles to isolate the redesigned login layout */}
      <style>{`
        .login-page-wrapper {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100%;
          font-family: 'Outfit', 'Inter', sans-serif;
          background-color: #ffffff;
          color: #1e293b;
        }

        .login-main-container {
          display: flex;
          flex: 1;
          width: 100%;
        }

        /* Left Section (50%) */
        .login-left-pane {
          width: 50%;
          background: linear-gradient(135deg, #eef0ff 0%, #e4e7ff 45%, #eaf6f4 100%);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 60px;
          position: relative;
          overflow: hidden;
          border-right: 1px solid #e2e8f0;
        }

        .login-left-branding {
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 10;
        }

        .login-left-logo-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 55%, #4338ca 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 20px;
          box-shadow: 0 10px 22px -8px rgba(79, 70, 229, 0.6);
        }

        .login-left-branding-text {
          display: flex;
          flex-direction: column;
        }

        .login-left-branding-title {
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          letter-spacing: 0.5px;
        }

        .login-left-branding-sub {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .login-left-content {
          margin: auto 0;
          max-width: 540px;
          z-index: 10;
          padding-top: 40px;
          padding-bottom: 20px;
        }

        .login-left-h1 {
          font-size: 42px;
          font-weight: 800;
          line-height: 1.2;
          color: #0f172a;
          margin-bottom: 16px;
        }

        .login-left-h1 span {
          color: #4f46e5;
          display: block;
        }

        .login-left-h1-underline {
          width: 50px;
          height: 3px;
          background-color: #4f46e5;
          margin-top: 12px;
          border-radius: 2px;
        }

        .login-left-desc {
          font-size: 14.5px;
          line-height: 1.6;
          color: #475569;
          margin-top: 24px;
          margin-bottom: 32px;
        }

        .login-features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px 32px;
        }

        .login-feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #334155;
        }

        .login-feature-icon-wrapper {
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Hospital Art */
        .login-hospital-illustration {
          width: 100%;
          max-width: 480px;
          height: auto;
          margin-top: auto;
          z-index: 1;
        }

        /* Right Section (50%) */
        .login-right-pane {
          width: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          background-color: #ffffff;
        }

        .login-glass-card {
          /* max-width, not width: a hard 460px overflows a 390px phone, and
             because body sets overflow-x: hidden the card is clipped rather than
             scrollable — the sign-in button ends up off-screen with nothing to
             indicate it. Capped at 460px, so the desktop layout is unchanged. */
          width: 100%;
          max-width: 460px;
          background: #ffffff;
          border: 1px solid #e8eef6;
          border-radius: 20px;
          padding: 36px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-card-header {
          text-align: center;
          margin-bottom: 4px;
        }

        .login-card-welcome-title {
          font-size: 26px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .login-card-subtitle {
          font-size: 13.5px;
          color: #64748b;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .login-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .login-input-label {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }

        .login-input-wrapper {
          position: relative;
          width: 100%;
        }

        .login-input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          display: flex;
          align-items: center;
          pointer-events: none;
        }

        .login-text-input {
          width: 100%;
          height: 46px;
          padding: 0 16px 0 44px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background-color: #ffffff;
          font-size: 14px;
          color: #1e293b;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .login-text-input:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.14);
        }

        .password-toggle-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
        }

        .password-toggle-btn:hover {
          color: #64748b;
        }

        /* Role Selection Grid */
        .login-roles-header {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 4px;
        }

        .login-roles-grid {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          width: 100%;
        }

        .login-role-card {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          background-color: #ffffff;
          transition: all 0.2s;
          user-select: none;
          text-align: center;
          min-height: 90px;
          font: inherit;
          color: inherit;
          appearance: none;
        }

        .login-role-card:hover {
          border-color: #cbd5e1;
          background-color: #f8fafc;
          transform: translateY(-1px);
        }

        .login-role-card.selected {
          border-color: #4f46e5;
          background-color: rgba(79, 70, 229, 0.05);
          color: #4f46e5;
          box-shadow: 0 0 0 1px #4f46e5;
        }

        .login-role-icon {
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .login-role-card.selected .login-role-icon {
          color: #4f46e5;
        }

        .login-role-name {
          font-size: 11px;
          font-weight: 600;
          color: #475569;
          line-height: 1.3;
        }

        .login-role-card.selected .login-role-name {
          color: #4f46e5;
        }

        .login-extra-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13.5px;
          margin-top: 4px;
        }

        .login-remember-container {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: #475569;
          font-weight: 500;
        }

        .login-remember-checkbox {
          cursor: pointer;
          accent-color: #4f46e5;
          width: 16px;
          height: 16px;
        }

        .login-forgot-link {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 600;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          font-family: inherit;
          font-size: inherit;
        }

        .login-forgot-link:hover {
          text-decoration: underline;
        }

        .login-submit-btn {
          width: 100%;
          height: 48px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 55%, #4338ca 100%);
          border: none;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 18px -8px rgba(79, 70, 229, 0.65);
          transition: filter 0.2s, box-shadow 0.2s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .login-submit-btn:hover {
          filter: brightness(1.06);
          box-shadow: 0 12px 24px -8px rgba(79, 70, 229, 0.6);
        }

        .login-submit-btn:active {
          transform: scale(0.98);
        }

        .login-error-container {
          background-color: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: 8px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 13px;
          font-weight: 500;
          text-align: center;
        }

        /* Status Checks */
        .login-status-divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 8px 0;
        }

        .login-status-divider::before,
        .login-status-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #e2e8f0;
        }

        .login-status-divider:not(:empty)::before {
          margin-right: .5em;
        }

        .login-status-divider:not(:empty)::after {
          margin-left: .5em;
        }

        .login-status-checklist {
          display: flex;
          justify-content: center;
          gap: 16px;
          font-size: 11.5px;
          font-weight: 600;
          color: #475569;
        }

        .login-status-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .login-status-dot {
          width: 6px;
          height: 6px;
          background-color: #10b981;
          border-radius: 50%;
        }

        .login-footer {
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          margin-top: 4px;
        }

        /* Bottom Footer Bar */
        .login-footer-bar {
          height: 80px;
          border-top: 1px solid #e2e8f0;
          background-color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 60px;
          width: 100%;
          z-index: 10;
        }

        .login-footer-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .login-footer-icon-wrapper {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background-color: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-footer-text-wrapper {
          display: flex;
          flex-direction: column;
        }

        .login-footer-text-bold {
          font-size: 13.5px;
          font-weight: 700;
          color: #1e293b;
        }

        .login-footer-text-sub {
          font-size: 11.5px;
          color: #64748b;
        }

        /* Reset Success State */
        .reset-success-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 20px 0;
          gap: 16px;
        }

        .success-icon-wrapper {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background-color: #ecfdf5;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .success-msg {
          font-size: 14.5px;
          color: #374151;
          line-height: 1.5;
        }

        /* Phone: reclaim the padding the card spends on decoration, so the form
           itself gets the width. 36px each side costs a fifth of a 390px screen. */
        @media (max-width: 480px) {
          .login-glass-card {
            padding: 24px 18px;
            border-radius: 16px;
          }
          .login-card-welcome-title {
            font-size: 22px;
          }
        }

        /* Responsive Layout */
        @media (max-width: 1024px) {
          .login-left-pane {
            display: none;
          }
          .login-right-pane {
            width: 100%;
          }
          .login-footer-bar {
            padding: 0 30px;
            justify-content: center;
          }
        }
      `}</style>

      {/* MAIN CONTAINER */}
      <div className="login-main-container">
        
        {/* LEFT PANE */}
        <div className="login-left-pane">
          
          {/* Brand Top Left */}
          <div className="login-left-branding">
            <div className="login-left-logo-icon">RK</div>
            <div className="login-left-branding-text">
              <span className="login-left-branding-title">RK CLINIC LIS</span>
              <span className="login-left-branding-sub">Laboratory Workflow &amp; Reporting System</span>
            </div>
          </div>

          {/* Left Section Main Content */}
          <div className="login-left-content">
            <h1 className="login-left-h1">
              Digital Diagnostics.
              <span>Faster Reports.</span>
              <div className="login-left-h1-underline"></div>
            </h1>
            
            <p className="login-left-desc">
              RK Clinic&apos;s Laboratory Workflow &amp; Reporting System connects doctors and the lab in one place — digital test ordering, sample tracking, result entry, verification and instant report delivery, with analyzer integration ready for the future.
            </p>

            <div className="login-features-grid">
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </span>
                <span>Doctor Test Ordering</span>
              </div>
              
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <span>Barcode Sample Tracking</span>
              </div>
              
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <span>Result Entry & Verification</span>
              </div>
              
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M9 15h6M9 18h3" />
                  </svg>
                </span>
                <span>PDF Report Generation</span>
              </div>
              
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h12M12 3v7M9 12h6M5 21h14M19 21l-7-11L5 21z" />
                  </svg>
                </span>
                <span>Laboratory Automation (LIS)</span>
              </div>
              
              <div className="login-feature-item">
                <span className="login-feature-icon-wrapper">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M9 9h6v6H9z" />
                    <path d="M4 12h2M18 12h2M12 4v2M12 18v2" />
                  </svg>
                </span>
                <span>Analyzer Integration Ready</span>
              </div>
            </div>
          </div>

          {/* Hospital Line Art Illustration */}
          <svg className="login-hospital-illustration" viewBox="0 0 600 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="50" y1="180" x2="550" y2="180" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
            <circle cx="100" cy="140" r="20" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            <line x1="100" y1="140" x2="100" y2="180" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            <line x1="90" y1="160" x2="100" y2="150" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            
            <circle cx="500" cy="140" r="20" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            <line x1="500" y1="140" x2="500" y2="180" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            <line x1="510" y1="160" x2="500" y2="150" stroke="#4f46e5" strokeWidth="2" opacity="0.25" />
            
            <rect x="250" y="50" width="100" height="130" rx="4" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.3" />
            <rect x="180" y="80" width="70" height="100" rx="4" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.3" />
            <rect x="350" y="80" width="70" height="100" rx="4" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.3" />
            
            <rect x="270" y="70" width="15" height="15" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="315" y="70" width="15" height="15" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="270" y="100" width="15" height="15" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="315" y="100" width="15" height="15" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            
            <rect x="200" y="100" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="225" y="100" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="200" y="130" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="225" y="130" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            
            <rect x="370" y="100" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="395" y="100" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="370" y="130" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            <rect x="395" y="130" width="12" height="12" rx="2" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.4" />
            
            <path d="M285 180 V150 H315 V180" stroke="#4f46e5" strokeWidth="2" opacity="0.4" />
            
            <path d="M292 25 H308 M300 17 V33" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
            <circle cx="300" cy="25" r="14" fill="none" stroke="#4f46e5" strokeWidth="2" opacity="0.4" />
            
            <path d="M70 60 H80 M75 55 V65" stroke="#4f46e5" strokeWidth="1.5" opacity="0.2" />
            <path d="M120 30 H128 M124 26 V34" stroke="#4f46e5" strokeWidth="1.5" opacity="0.2" />
            <path d="M480 50 H490 M485 45 V55" stroke="#4f46e5" strokeWidth="1.5" opacity="0.2" />
            <path d="M530 80 H538 M534 76 V84" stroke="#4f46e5" strokeWidth="1.5" opacity="0.2" />
          </svg>

        </div>

        {/* RIGHT PANE */}
        <div className="login-right-pane">
          
          {isForgotPassword ? (
            /* Forgot Password Card */
            <div className="login-glass-card">
              <div className="login-card-header">
                <h2 className="login-card-welcome-title">Reset Password</h2>
                <p className="login-card-subtitle">Enter your email to receive a password reset link.</p>
              </div>

              {resetSent ? (
                <div className="reset-success-container">
                  <div className="success-icon-wrapper">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#10b981" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="success-msg">A password reset link has been dispatched to <strong>{resetEmail}</strong>.</p>
                  <button 
                    type="button" 
                    className="login-submit-btn" 
                    style={{ marginTop: '16px' }}
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                      setResetEmail('');
                    }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form className="login-form" onSubmit={handleForgotPasswordSubmit}>
                  <div className="login-input-group">
                    <label className="login-input-label" htmlFor="reset-email">Email Address</label>
                    <div className="login-input-wrapper">
                      <span className="login-input-icon">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </span>
                      <input 
                        type="email" 
                        id="reset-email"
                        className="login-text-input"
                        placeholder="Enter your email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="login-submit-btn" style={{ marginTop: '10px' }}>
                    Send Reset Link
                  </button>

                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <button 
                      type="button"
                      className="login-forgot-link"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setErrorMsg('');
                      }}
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Login Form Card */
            <div className="login-glass-card">
              
              <div className="login-card-header">
                <h2 className="login-card-welcome-title">Welcome Back</h2>
                <p className="login-card-subtitle">Sign in to access RK Clinic Laboratory</p>
              </div>

              {errorMsg && (
                <div className="login-error-container">
                  {errorMsg}
                </div>
              )}

              <form className="login-form" onSubmit={handleSubmit}>
                
                {/* Username Input */}
                <div className="login-input-group">
                  <label className="login-input-label" htmlFor="login-username">Email / Username</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </span>
                    <input 
                      type="text" 
                      id="login-username"
                      className="login-text-input"
                      placeholder="Enter your email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="login-input-group">
                  <label className="login-input-label" htmlFor="login-password">Password</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      id="login-password"
                      className="login-text-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button 
                      type="button" 
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Role selectors */}
                <div className="login-roles-header">Select Your Role</div>
                <div className="login-roles-grid">
                  {roles.map(r => (
                    <button 
                      type="button"
                      key={r.id}
                      className={`login-role-card ${selectedRole === r.id ? 'selected' : ''}`}
                      onClick={() => handleRoleSelect(r.id)}
                      aria-pressed={selectedRole === r.id}
                      aria-label={`Select role: ${r.name}`}
                    >
                      <span className="login-role-icon" aria-hidden="true">{r.icon}</span>
                      <span className="login-role-name">{r.name}</span>
                    </button>
                  ))}
                </div>

                {/* Remember Me & Forgot Password link */}
                <div className="login-extra-row">
                  <label className="login-remember-container">
                    <input 
                      type="checkbox" 
                      className="login-remember-checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember Me</span>
                  </label>
                  
                  <button 
                    type="button"
                    className="login-forgot-link"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setResetEmail(username);
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Sign In button */}
                <button type="submit" className="login-submit-btn">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  <span>Sign In</span>
                </button>

              </form>

              {/* Status Divider */}
              <div className="login-status-divider">System Status</div>

              {/* Status checklist */}
              <div className="login-status-checklist">
                <div className="login-status-item">
                  <span className="login-status-dot"></span>
                  <span>LIS Services Online</span>
                </div>
                <div className="login-status-item">
                  <span className="login-status-dot"></span>
                  <span>Analyzer Link Ready</span>
                </div>
                <div className="login-status-item">
                  <span className="login-status-dot"></span>
                  <span>Database Connected</span>
                </div>
              </div>

              {/* Footer info */}
              <div className="login-footer">
                Version 1.0.0 | Powered by RK Clinic LIS
              </div>

            </div>
          )}

        </div>

      </div>

      {/* BOTTOM FOOTER BAR */}
      <div className="login-footer-bar">
        <div className="login-footer-left">
          <div className="login-footer-icon-wrapper">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 11 11 13 15 9" />
            </svg>
          </div>
          <div className="login-footer-text-wrapper">
            <span className="login-footer-text-bold">Secure. Reliable. Integrated.</span>
            <span className="login-footer-text-sub">Your trusted partner in laboratory diagnostics.</span>
          </div>
        </div>
      </div>

    </div>
  );
}
