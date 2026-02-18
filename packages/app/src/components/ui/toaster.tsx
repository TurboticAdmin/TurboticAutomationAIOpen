"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react"

const variantIcons = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  default: Info,
}

const variantColors = {
  success: "text-[#3C9F53]",
  info: "text-[#1677FF]",
  warning: "text-[#FAAD14]",
  error: "text-[#D13036]",
  default: "text-[#1677FF]",
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon = variantIcons[variant as keyof typeof variantIcons] || variantIcons.default
        const iconColor = variantColors[variant as keyof typeof variantColors] || variantColors.default

        return (
          <Toast key={id} {...props} variant={variant} className="shadow-2xl rounded-xl">
            <div className="flex items-start gap-3 w-full">
              <Icon className={`h-6 w-6 flex-shrink-0 ${iconColor}`} />
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
