import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./lib/auth";
import { StoreProvider } from "./lib/store";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Movements from "./pages/Movements";
import Expenses from "./pages/Expenses";
import Clients from "./pages/Clients";
import Staff from "./pages/Staff";
import Shifts from "./pages/Shifts";

export default function App() {
  const { t } = useTranslation();
  const { me, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-ink-500">{t("common.loading")}</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route
        element={
          me ? (
            <StoreProvider>
              <Layout />
            </StoreProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/movements" element={<Movements />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/staff" element={<Staff />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
