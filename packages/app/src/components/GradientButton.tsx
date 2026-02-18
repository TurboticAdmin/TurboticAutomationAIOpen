import { MouseEventHandler } from "react";

const GradientButton = ({
  children,
  className = "",
  onClick,
  state = 'on',
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  state?: 'on' | 'off';
}) => {
  return (
    <button className={`gradient-button ${className} ${state === 'off' ? 'state-off' : ''}`} onClick={onClick}>
      <span>{children}</span>
    </button>
  );
};

export default GradientButton;
