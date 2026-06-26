# RK Clinic - Healthcare Management Dashboard

A modern, premium medical SaaS platform dashboard designed for **RK Clinic**. It is built as a highly responsive, feature-rich Single Page Application (SPA) using clean Semantic HTML5, Vanilla CSS3, and interactive JavaScript.

## Features & Modules

- **Dynamic Navigation Sidebar**: Fast access to 12 modular departments (Dashboard, Patients, OPD, IPD, Nursing Notes, Pharmacy, Inventory, Billing, Reports, Scheduler, Settings).
- **Interactive Consultation Queue**: Live Token Queue for out-patients. Allows the doctor/staff to call the next patient, which advances status states dynamically (`Waiting` -> `In-Consultation` -> `Completed`).
- **Reactive State Management**: Adds registered patients, billing transactions, medicine inventory stock, and prescriptions to a client-side database in real-time.
- **Visual Analytics**: Interactive responsive charts powered by Chart.js mapping patient growth, revenue metrics, specialty split, and top drugs. Charts auto-update dynamically when data changes.
- **Accessible Native Modals**: Custom `<dialog>` elements for operations like recording bills, registering patients, and dispensing drugs. Includes cross-browser light-dismiss fallback support.
- **Timeline Patient History Drawer**: Allows clinic staff to click on any patient profile row to display a chronological vertical timeline of their entire history (consultations, prescription scripts, invoices, and nursing notes).

## Visual Style Guide

- **Typography**: `Inter` and `Outfit` fonts loaded from Google Fonts.
- **Theme Color Palette**:
  - Background: `#f8fafc` (Slate-50)
  - Surface: `#ffffff` (White panels & sidebar)
  - Medical Accent: `#0284c7` (Sky-600)
  - Teal Accent: `#0d9488` (Teal-600)
  - Emerald Success: `#059669` (Emerald-600)
  - Warning States: `#d97706` (Amber-600)
  - Alert States: `#e11d48` (Rose-600)
- **Roundness**: Rounded corners (`12px` to `16px`) for visual harmony.
- **Shadows**: Custom soft elevation shadows representing modern depth hierarchies.

## File Structure

- `index.html`: Holds the DOM shell, including header, navigation tabs, panels, and overlay dialogs.
- `style.css`: Implements CSS layout systems (Grid & Flexbox), custom scrollbars, styling variables, animations, and responsive queries.
- `app.js`: Holds mock state records, routing scripts, interactive event handlers, and data chart bindings.

## How to Run Locally

You can launch the development server or open the project files directly:

**Option 1: Using Vite Dev Server (Recommended)**
Install dependencies and start the dev server:
```bash
npm install
npm run dev
```
Then, open `http://localhost:5173` in your web browser.

**Option 2: Using Python (Built-in)**
Run the following command in the project directory:
```bash
python3 -m http.server 8000
```
Then, open `http://localhost:8000` in your web browser.

**Option 3: Open Directly**
Simply double-click `index.html` in your file explorer to open it directly as a local file.
