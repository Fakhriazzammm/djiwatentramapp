import ReactDOM from "react-dom/client";
import { YumiAuthProvider } from "@yumipos/web-shared/hooks/useYumiAuth";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <YumiAuthProvider>
    <App />
  </YumiAuthProvider>,
);
