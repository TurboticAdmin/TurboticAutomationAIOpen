import { RefObject, useEffect, useState } from "react";

export default function useTerminalSelection(terminalRef: RefObject<any>) {
  const [state, setState] = useState({
    show: false,
    x: 0,
    y: 0,
    text: "",
  });

  const close = (clearSelection = true) => {
    setState({
      show: false,
      x: 0,
      y: 0,
      text: "",
    });
    if (clearSelection) {
      terminalRef.current?.clearSelection(); 
    }
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.onSelectionChange(() => {
        if (terminalRef.current.hasSelection()) {
          const text = terminalRef.current.getSelection();
          const pos = terminalRef.current.getSelectionPosition();

          if (text && pos) {
            const core = terminalRef.current._core; // xterm internals
            const dims = core._renderService.dimensions;
            const device = dims.device;

            const cellWidth = device.cell.width;
            const cellHeight = device.cell.height;

            const viewPort = document.querySelector(".log-container .xterm-viewport") as HTMLElement;
            const logContainer = document.querySelector(".log-container") as HTMLElement;
            const terminalElement = terminalRef.current.element;

            if (!viewPort || !logContainer || !terminalElement) {
              return;
            }

            // Get actual rendered positions accounting for zoom/scale via getBoundingClientRect
            const viewPortRect = viewPort.getBoundingClientRect();
            const logContainerRect = logContainer.getBoundingClientRect();
            const terminalRect = terminalElement.getBoundingClientRect();

            // Calculate offset of terminal element within log-container
            const terminalOffsetTop = terminalRect.top - logContainerRect.top;
            const terminalOffsetLeft = terminalRect.left - logContainerRect.left;

            // pos.start.y is the buffer row (absolute from top of buffer)
            // Convert scroll from pixels to rows
            const scrollTop = viewPort.scrollTop;
            const scrolledRows = Math.floor(scrollTop / cellHeight);

            // Calculate viewport-relative row (row within visible terminal)
            const viewportRow = pos.start.y - scrolledRows;

            // Convert buffer coordinates to pixel coordinates, then add terminal offset
            const x = pos.start.x * cellWidth + terminalOffsetLeft;
            const y = viewportRow * cellHeight + terminalOffsetTop;

            setState({ x, y, text, show: true });
          }
        } else {
          setState({
            x: 0,
            y: 0,
            text: "",
            show: false,
          });
        }
      });
    }
  }, [terminalRef.current]);

  useEffect(() => {
    return () => {
      setState({
        show: false,
        x: 0,
        y: 0,
        text: "",
      });
    };
  }, []);

  return {
    ...state,
    close,
  };
}
