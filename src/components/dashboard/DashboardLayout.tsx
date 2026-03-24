import React from 'react';

interface DashboardLayoutProps {
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  sidebar: React.ReactNode;
  mainContent: React.ReactNode;
  rightPanel: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  isSidebarOpen,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  sidebar,
  mainContent,
  rightPanel
}) => {
  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        ${!isSidebarOpen && 'lg:hidden'}
      `}>
        {sidebar}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-900 relative">
        {mainContent}
      </div>

      {/* Right Panel */}
      <div className="hidden xl:flex w-80 flex-col border-l border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
        {rightPanel}
      </div>
    </div>
  );
};
