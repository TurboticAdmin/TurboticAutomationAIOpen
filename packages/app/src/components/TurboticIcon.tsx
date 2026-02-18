import { useTheme } from "@/contexts/ThemeContext";
import React from "react";

const TurboticIcon = ({ className = "", withName = false }) => {
  const { theme } = useTheme();

  if (withName) { 
    return (
      <img
        src={theme === 'light' ? "/images/logo-horizontal.svg": '/images/turbotic-logo.png'}
        alt="Turbotic Logo"
        className="h-8 w-auto block"
      />
    )
  }

  return (
    <img
      src={
        theme === "light"
          ? "/images/logo-mark-blue.png"
          : "/images/logo-mark-white.png"
      }
      alt="Turbotic Logo"
      className={`h-8 w-auto block ${className}`}
    />
  );
};

export default TurboticIcon;
