declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>);
    scaleViewport: boolean;
    resizeSession: boolean;
    focusOnClick: boolean;
    clipViewport: boolean;
    viewOnly: boolean;
    disconnect(): void;
    sendCredentials(credentials: Record<string, unknown>): void;
    sendKey(keysym: number, code: string, down?: boolean): void;
    clipboardPasteFrom(text: string): void;
    focus(options?: { preventScroll?: boolean }): void;
  }
}
