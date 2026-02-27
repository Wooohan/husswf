import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Calendar, Search, Filter, ChevronDown, ExternalLink, AlertCircle } from 'lucide-react';

interface FMCSARegisterEntry {
  number: string;
  title: string;
  decided: string;
  category: string;
}

export const FMCSARegister: React.FC = () => {
  const [registerData, setRegisterData] = useState<FMCSARegisterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');

  const categories = [
    'NAME CHANGE',
    'CERTIFICATE, PERMIT, LICENSE',
    'CERTIFICATE OF REGISTRATION',
    'DISMISSAL',
    'WITHDRAWAL',
    'REVOCATION',
    'MISCELLANEOUS',
    'TRANSFERS',
    'GRANT DECISION NOTICES'
  ];

  useEffect(() => {
    fetchRegisterData();
  }, []);

  const fetchRegisterData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Call the backend API endpoint
      const response = await fetch('http://localhost:3001/api/fmcsa-register');
      
      if (!response.ok) {
        throw new Error('Failed to fetch register data');
      }
      
      const data = await response.json();
      
      if (data.success && data.entries && data.entries.length > 0) {
        setRegisterData(data.entries);
        setLastUpdated(new Date().toLocaleString());
      } else {
        // If no entries returned, load mock data
        throw new Error('No entries found in response');
      }
    } catch (err) {
      console.error('Error fetching FMCSA register:', err);
      setError('Unable to fetch live register data. Displaying sample data. Make sure the backend server is running on port 3001.');
      
      // Load mock data for demonstration
      loadMockData();
    } finally {
      setIsLoading(false);
    }
  };

  const loadMockData = () => {
    const mockData: FMCSARegisterEntry[] = [
      { number: 'FF-40152', title: 'PFL TRANSPORTATION SOLUTIONS INC - SURREY, BC, CA', decided: '02/10/2026', category: 'NAME CHANGE' },
      { number: 'MC-19745', title: 'MACON SIX TRANSPORT LLC - LANSING, IL', decided: '02/10/2026', category: 'NAME CHANGE' },
      { number: 'MC-40152', title: 'FD&H TRANSPORTATION SERVICES - SPRING, TX', decided: '02/10/2026', category: 'NAME CHANGE' },
      { number: 'MC-349801', title: 'PROFESSIONAL AUTOMOTIVE RELOCATION SERVIC - GAINESVILLE, VA', decided: '02/10/2026', category: 'NAME CHANGE' },
      { number: 'FF-70665', title: 'ELITE LOGIX USA CORP - TAMPA, FL', decided: '01/28/2026', category: 'CERTIFICATE, PERMIT, LICENSE' },
      { number: 'MC-102136', title: 'ANTONIO HALL MANAGEMENT LLC - WINDSOR, CT', decided: '01/27/2026', category: 'CERTIFICATE, PERMIT, LICENSE' },
      { number: 'MC-755001', title: 'TCS GROUP INC - MISSISSAUGA, ON, CA', decided: '01/28/2026', category: 'CERTIFICATE, PERMIT, LICENSE' },
      { number: 'MC-779664', title: 'BUME FARMS TRANSPORT, LLC - SOUTH VIENNA, OH', decided: '12/17/2025', category: 'CERTIFICATE, PERMIT, LICENSE' },
      { number: 'MC-1129516', title: 'PROSPERITY ENTERPRISE SERVICES LLC - ECORSE, MI', decided: '01/28/2026', category: 'CERTIFICATE, PERMIT, LICENSE' },
      { number: 'MC-1285840', title: 'JBGB TRANSPORT LLC - LYNDONVILLE, VT', decided: '01/30/2026', category: 'CERTIFICATE, PERMIT, LICENSE' },
    ];
    
    setRegisterData(mockData);
    setLastUpdated(new Date().toLocaleString());
  };

  const filteredData = registerData.filter(entry => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch = entry.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         entry.number.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'NAME CHANGE': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'CERTIFICATE, PERMIT, LICENSE': 'bg-green-500/20 text-green-300 border-green-500/30',
      'CERTIFICATE OF REGISTRATION': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'DISMISSAL': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'WITHDRAWAL': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      'REVOCATION': 'bg-red-500/20 text-red-300 border-red-500/30',
      'MISCELLANEOUS': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      'TRANSFERS': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      'GRANT DECISION NOTICES': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
    return colors[category] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">FMCSA Register</h1>
          <p className="text-slate-400">Daily Summary of Motor Carrier Applications and Decisions</p>
        </div>
        <button
          onClick={fetchRegisterData}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          Refresh Data
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-400" size={20} />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <Calendar className="text-indigo-400" size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400">Last Updated</p>
              <p className="text-white font-semibold">{lastUpdated || 'Not yet loaded'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <FileText className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Entries</p>
              <p className="text-white font-semibold">{registerData.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Filter className="text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400">Filtered Results</p>
              <p className="text-white font-semibold">{filteredData.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by MC/FF number or company name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-10 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center">
          <h3 className="font-bold text-white">Register Entries</h3>
          <a
            href="https://li-public.fmcsa.dot.gov/LIVIEW/pkg_menu.prc_menu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View on FMCSA
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading register data...</p>
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-slate-400">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>No entries found matching your criteria</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-200 sticky top-0">
                <tr>
                  <th className="p-4 font-medium text-xs uppercase tracking-wider">Number</th>
                  <th className="p-4 font-medium text-xs uppercase tracking-wider">Title</th>
                  <th className="p-4 font-medium text-xs uppercase tracking-wider">Category</th>
                  <th className="p-4 font-medium text-xs uppercase tracking-wider">Decided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredData.map((entry, index) => (
                  <tr key={index} className="hover:bg-slate-700/50 transition-colors text-slate-300">
                    <td className="p-4 font-mono text-white font-semibold">{entry.number}</td>
                    <td className="p-4">{entry.title}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getCategoryColor(entry.category)}`}>
                        {entry.category}
                      </span>
                    </td>
                    <td className="p-4 font-mono">{entry.decided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-4 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Note:</strong> This data is fetched from the FMCSA Register and updates daily. 
          The register contains decisions and notices released by the Federal Motor Carrier Safety Administration. 
          For the most current information, please visit the official FMCSA website.
        </p>
      </div>
    </div>
  );
};
