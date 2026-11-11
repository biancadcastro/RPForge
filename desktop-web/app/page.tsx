import { DesktopApp } from "../components/desktop-app";
import { ToastProvider } from "../components/toast";
export default function Page() {
  return <ToastProvider><DesktopApp /></ToastProvider>;
}
