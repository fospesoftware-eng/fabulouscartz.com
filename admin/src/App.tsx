import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Role } from "../shared/types";
import { Shell } from "./components/Shell";
import { Button, EmptyState } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AuditPage } from "./pages/AuditPage";
import { BookingsPage } from "./pages/BookingsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { ContentPage } from "./pages/ContentPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DepositsPage } from "./pages/DepositsPage";
import { DiscountsPage } from "./pages/DiscountsPage";
import { DisputesPage } from "./pages/DisputesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ListingsPage } from "./pages/ListingsPage";
import { LoginPage } from "./pages/LoginPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OverduePage } from "./pages/OverduePage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { ProductEditorPage } from "./pages/ProductEditorPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SellersPage } from "./pages/SellersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VendorsPage } from "./pages/VendorsPage";

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="card card-pad">
        <EmptyState
          icon={<ShieldAlert size={22} />}
          title="Restricted workspace"
          body={`Your ${user.role} role cannot open ${location.pathname}. Ask an admin if you need access.`}
          action={
            <Button variant="outline" onClick={() => { window.location.href = "/"; }}>
              Back to dashboard
            </Button>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="boot-splash" role="status" aria-label="Loading operations console">
        <span className="boot-mark" />
        <span className="boot-copy">Fabulous Cartz · Operations</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<Guard roles={["admin", "manager"]}><ProductEditorPage /></Guard>} />
        <Route path="products/:id" element={<ProductEditorPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="customers" element={<Guard roles={["admin", "manager"]}><CustomersPage /></Guard>} />
        <Route path="categories" element={<Guard roles={["admin", "manager"]}><CategoriesPage /></Guard>} />
        <Route path="vendors" element={<Guard roles={["admin", "manager"]}><VendorsPage /></Guard>} />
        <Route path="content" element={<Guard roles={["admin", "manager"]}><ContentPage /></Guard>} />
        <Route path="discounts" element={<Guard roles={["admin", "manager"]}><DiscountsPage /></Guard>} />
        <Route path="analytics" element={<Guard roles={["admin", "manager"]}><AnalyticsPage /></Guard>} />
        <Route path="audit" element={<Guard roles={["admin", "manager"]}><AuditPage /></Guard>} />
        <Route path="sellers" element={<SellersPage />} />
        <Route path="payouts" element={<PayoutsPage />} />
        <Route path="listings" element={<ListingsPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="deposits" element={<DepositsPage />} />
        <Route path="overdue" element={<OverduePage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="settings" element={<Guard roles={["admin"]}><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
