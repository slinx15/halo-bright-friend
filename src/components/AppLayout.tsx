import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";

const AppLayout = () => {
  return (
    <div className="flex min-h-screen bg-background w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-24 md:pb-0 overflow-auto overflow-x-hidden scroll-smooth safe-bottom">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
