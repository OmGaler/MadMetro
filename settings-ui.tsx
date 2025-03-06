import React, { useState } from 'react';
import { Moon, Sun, Map, Info, Settings, X } from 'lucide-react';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('appearance');
  const [darkMode, setDarkMode] = useState(false);
  const [showStationsRoutes, setShowStationsRoutes] = useState(true);

  const tabs = [
    { id: 'simulation', label: 'Simulation', icon: <Map size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Settings size={18} /> },
    { id: 'lineDetails', label: 'Line Details', icon: <Info size={18} /> },
    { id: 'moreInfo', label: 'More Info', icon: <Info size={18} /> }
  ];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold dark:text-white">Settings</h1>
        <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          <X size={24} className="text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Horizontal Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`flex items-center justify-center flex-1 py-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mr-2">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div className="pb-4">
              <h2 className="text-lg font-medium dark:text-white">Appearance Settings</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Customize how the application looks</p>
            </div>
            
            <div className="space-y-6">
              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {darkMode ? <Moon size={20} className="mr-3 text-gray-700 dark:text-gray-300" /> : <Sun size={20} className="mr-3 text-gray-700 dark:text-gray-300" />}
                  <div>
                    <div className="text-gray-700 dark:text-gray-300 font-medium">Dark Mode</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark themes</div>
                  </div>
                </div>
                <button 
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-blue-500' : 'bg-gray-300'}`}
                  onClick={() => setDarkMode(!darkMode)}
                >
                  <span 
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              {/* Show Stations & Routes */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Map size={20} className="mr-3 text-gray-700 dark:text-gray-300" />
                  <div>
                    <div className="text-gray-700 dark:text-gray-300 font-medium">Show Stations & Routes</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Display stations and route information on the map</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showStationsRoutes}
                  onChange={() => setShowStationsRoutes(!showStationsRoutes)}
                  className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'simulation' && (
          <div className="space-y-6">
            <div className="pb-4">
              <h2 className="text-lg font-medium dark:text-white">Simulation Settings</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure simulation speed and behavior</p>
            </div>
            {/* Simulation content would go here */}
          </div>
        )}

        {activeTab === 'lineDetails' && (
          <div className="space-y-6">
            <div className="pb-4">
              <h2 className="text-lg font-medium dark:text-white">Line Details</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage line visualization settings</p>
            </div>
            {/* Line details content would go here */}
          </div>
        )}

        {activeTab === 'moreInfo' && (
          <div className="space-y-6">
            <div className="pb-4">
              <h2 className="text-lg font-medium dark:text-white">More Information</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Additional settings and information</p>
            </div>
            {/* More info content would go here */}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;