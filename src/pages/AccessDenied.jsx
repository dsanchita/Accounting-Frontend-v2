// pages/AccessDenied.jsx
import React from "react";
import { useMsal } from "@azure/msal-react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

function AccessDenied() {
  const { instance } = useMsal();
  const navigator=useNavigate();

  const handleLogout = async () => {
    try {
      localStorage.removeItem("selectedCompany");
      localStorage.clear();
    navigator("/login")
      await instance.logoutRedirect();
    } catch (error) {
      toast.error("Logout failed. Please try again.");
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl shadow-sm p-8 text-center">
        {/* Icon / Header */}
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-neutral-900">
            Access Denied
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            You don’t have permission to access this page.
          </p>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-sm text-neutral-600">
            Please contact your administrator or switch to an authorized
            account.
          </p>
        </div>

        {/* Action */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 text-sm font-medium 
                     bg-neutral-900 text-white rounded-lg
                     hover:bg-neutral-800 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default AccessDenied;


