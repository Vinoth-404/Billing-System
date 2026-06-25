import React, { createContext, useState, useEffect, useContext } from "react";
import axios from "axios";
const API = import.meta.env.VITE_API_URL;
const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    shop_name: localStorage.getItem("settings_shopName") || "SoleFlow Footwear",
    shop_address: localStorage.getItem("settings_shopAddress") || "123 Shoe Market St, T. Nagar, Chennai",
    shop_phone: localStorage.getItem("settings_shopPhone") || "+91 98765 43210",
    shop_logo: localStorage.getItem("settings_shopLogo") || ""
  });

  const loadSettings = async () => {
    try {
      const res = await axios.get(`${API}/api/settings`);
      if (res.data) {
        const settingsMap = {
          shop_name: res.data.shop_name || "SoleFlow Footwear",
          shop_address: res.data.shop_address || "123 Shoe Market St, T. Nagar, Chennai",
          shop_phone: res.data.shop_phone || "+91 98765 43210",
          shop_logo: res.data.shop_logo || ""
        };
        setSettings(settingsMap);
        
        // Sync local storage so standard page logic (like Billing defaults) matches immediately
        localStorage.setItem("settings_shopName", settingsMap.shop_name);
        localStorage.setItem("settings_shopAddress", settingsMap.shop_address);
        localStorage.setItem("settings_shopPhone", settingsMap.shop_phone);
        localStorage.setItem("settings_shopLogo", settingsMap.shop_logo);
      }
    } catch (err) {
      console.error("Failed to load settings in context:", err);
    }
  };

  useEffect(() => {
    loadSettings();

    // Listen for dynamic updates (e.g. storage updates or local triggers)
    const handleStorageUpdate = () => {
      loadSettings();
    };
    window.addEventListener("storage", handleStorageUpdate);
    return () => window.removeEventListener("storage", handleStorageUpdate);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loadSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
