import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";

const AppLayout = () => {
  return (
    <div className="flex min-h-screen bg-background w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto overflow-x-hidden overscroll-y-contain scroll-smooth pb-24 safe-bottom md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
