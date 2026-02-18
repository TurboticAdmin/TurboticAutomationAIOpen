import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

const GlobalLoading = ({ loadingText = 'Loading...' }: { loadingText?: string }) => {
  return (
    <div 
      className="container-background-color flex items-center justify-center"
      style={{ height: 'calc(var(--window-height) - 85px)' }}
    >
      <div className="text-center">
        <Spin
          indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />}
          size="large"
        />
        <p className="text-slate-600 dark:text-slate-400">{loadingText}</p>
      </div>
    </div>
  );
};

export default GlobalLoading;
