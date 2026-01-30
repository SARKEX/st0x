// Example of updating a common layout component
export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <nav className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* Navigation content with light/dark mode support */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">st0x</h1>
            </div>
            {/* Nav items */}
            <div className="flex items-center space-x-4">
              <a href="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Dashboard
              </a>
              <a href="/dashboard/settings" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Settings
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}