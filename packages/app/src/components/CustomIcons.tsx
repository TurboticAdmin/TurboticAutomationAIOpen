'use client';
import Icon from "@ant-design/icons";
import React from "react";
import { DashboardOutlined } from "@ant-design/icons";

// SVG Components
const KeyReturnSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    xmlns="http://www.w3.org/2000/svg"
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="transparent"
    {...props}
  >
    <path
      d="M22 13V17H10"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13 14L10 17L13 20"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
));
KeyReturnSvg.displayName = 'KeyReturnSvg';

const CaretDoubleDownSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g opacity="0.4">
      <path
        d="M11.25 19.5L3.75 12L11.25 4.5"
        stroke="#7F7F7F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.75 19.5L11.25 12L18.75 4.5"
        stroke="#7F7F7F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
));
CaretDoubleDownSvg.displayName = 'CaretDoubleDownSvg';

const HomeSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    width="24px"
    height="24px"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g clipPath="url(#clip0_2184_29922)">
      <path
        d="M3.75 20.2506H20.25V11.2506C20.2501 11.1521 20.2307 11.0545 20.1931 10.9635C20.1555 10.8724 20.1003 10.7897 20.0306 10.72L12.5306 3.21996C12.461 3.15023 12.3783 3.09491 12.2872 3.05717C12.1962 3.01943 12.0986 3 12 3C11.9014 3 11.8038 3.01943 11.7128 3.05717C11.6217 3.09491 11.539 3.15023 11.4694 3.21996L3.96938 10.72C3.89975 10.7897 3.84454 10.8724 3.8069 10.9635C3.76926 11.0545 3.74992 11.1521 3.75 11.2506V20.2506Z"
        stroke="black"
        strokeOpacity="0.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="clip0_2184_29922">
        <rect width="24px" height="24px" fill="white" />
      </clipPath>
    </defs>
  </svg>
));
HomeSvg.displayName = 'HomeSvg';

const AutomationSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g clipPath="url(#clip0_2192_3842)">
      <path
        d="M20.25 4.5H3.75C3.33579 4.5 3 4.83579 3 5.25V18.75C3 19.1642 3.33579 19.5 3.75 19.5H20.25C20.6642 19.5 21 19.1642 21 18.75V5.25C21 4.83579 20.6642 4.5 20.25 4.5Z"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 9H16.5"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 12H16.5"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 15H16.5"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="clip0_2192_3842">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
));
AutomationSvg.displayName = 'AutomationSvg';

const SquareSplitHorizontalSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g clipPath="url(#clip0_8625_118371)">
      <path
        d="M18.75 4.5H5.25C4.83579 4.5 4.5 4.83579 4.5 5.25V18.75C4.5 19.1642 4.83579 19.5 5.25 19.5H18.75C19.1642 19.5 19.5 19.1642 19.5 18.75V5.25C19.5 4.83579 19.1642 4.5 18.75 4.5Z"
        stroke="black"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 4H5.2C5.08954 4 5 4.33579 5 4.75V18.25C5 18.6642 5.08954 19 5.2 19H8.8C8.91046 19 9 18.6642 9 18.25V4.75C9 4.33579 8.91046 4 8.8 4Z"
        fill="black"
      />
      <path
        d="M10 4.5V19.5"
        stroke="black"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="clip0_8625_118371">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
));
SquareSplitHorizontalSvg.displayName = 'SquareSplitHorizontalSvg';

const FilesSvg = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    fill="none"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z"
      fill="currentColor"
      opacity="0.6"
    />
    <path
      d="M15 12H9c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1z"
      fill="currentColor"
      opacity="0.4"
    />
    <path
      d="M17 15H7c-.55 0-1-.45-1-1s.45-1 1-1h10c.55 0 1 .45 1 1s-.45 1-1 1z"
      fill="currentColor"
      opacity="0.4"
    />
  </svg>
));
FilesSvg.displayName = 'FilesSvg';

export function KeyReturnIcon(props: any) {
  return (
    <Icon
      component={KeyReturnSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function CaretDoubleDownIcon(props: any) {
  return (
    <Icon
      component={CaretDoubleDownSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function HomeIcon(props: any) {
  return (
    <Icon
      component={HomeSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function AutomationIcon(props: any) {
  return (
    <Icon
      component={AutomationSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function SquareSplitHorizontalIcon(props: any) {
  return (
    <Icon
      component={SquareSplitHorizontalSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function FileIcon(props: any) {
  return (
    <Icon
      component={FilesSvg}
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}

export function DashboardIcon(props: any) {
  return (
    <DashboardOutlined
      {...props}
      className={`${props.className || ""} custom-icon`}
    />
  );
}


