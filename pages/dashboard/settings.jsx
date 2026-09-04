import ThemeToggle from '../../components/ThemeToggle';
// ... existing imports

export default function Settings() {
  // ... existing code

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Settings</h1>
        
        {/* Theme Settings Section */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Theme</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark mode</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
        
        {/* ... rest of existing settings content */}
      </div>
    </div>
  );
}