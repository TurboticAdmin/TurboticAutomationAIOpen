"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({ ...props }: any) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as any}
      className="toaster group"
      duration={5000}
      position="top-right"
      offset="16px"
      toastOptions={{
        classNames: {
          toast: "toast",
          description: "",
          actionButton: "",
          cancelButton: "",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
