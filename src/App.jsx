import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  Edit,
  FileText,
  Filter,
  Key,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
  Trash2,
  Truck,
  User,
  Users,
} from 'lucide-react';
import { api, clearSessionToken, getSessionToken, setSessionToken } from './lib/api.js';

const STATUS_COLORS = {
  Pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Assigned: 'bg-blue-100 text-blue-800 border-blue-200',
  'In Progress': 'bg-purple-100 text-purple-800 border-purple-200',
  Completed: 'bg-green-100 text-green-800 border-green-200',
  Cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const PRIORITY_COLORS = {
  High: 'text-red-600 bg-red-50 border-red-100',
  Medium: 'text-orange-600 bg-orange-50 border-orange-100',
  Low: 'text-green-600 bg-green-50 border-green-100',
};

const FINAL_REQUEST_STATUSES = new Set(['Completed', 'Cancelled']);

function isFinalRequestStatus(status) {
  return FINAL_REQUEST_STATUSES.has(status);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const Badge = ({ children, className = '' }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}>{children}</span>
);

const Pagination = ({ totalItems, itemsPerPage, currentPage, onPageChange }) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 bg-gray-50/50">
      <span className="text-sm text-gray-500">
        Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
        <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of{' '}
        <span className="font-medium">{totalItems}</span> results
      </span>
      <div className="flex gap-2">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
};



function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded-full bg-blue-400 animate-pulse" />
        <div className="text-sm tracking-wide uppercase text-slate-300">Loading Z-Track</div>
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionTokenState] = useState(getSessionToken());
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [publicUsers, setPublicUsers] = useState([]);
  const [runners, setRunners] = useState([]);
  const [requests, setRequests] = useState([]);
  const [view, setView] = useState('dashboard');
  const [error, setError] = useState('');

  const refreshState = async (token = sessionToken) => {
    const data = await api.bootstrap(token);
    setCurrentUser(data.currentUser);
    setPublicUsers(data.publicUsers || []);
    setUsers(data.users || []);
    setRunners(data.runners || []);
    setRequests(data.requests || []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = getSessionToken();
        const data = await api.bootstrap(token);
        if (!active) return;
        setCurrentUser(data.currentUser);
        setPublicUsers(data.publicUsers || []);
        setUsers(data.users || []);
        setRunners(data.runners || []);
        setRequests(data.requests || []);
        setView('dashboard');
      } catch {
        clearSessionToken();
        setSessionTokenState('');
        if (active) {
          try {
            const data = await api.bootstrap('');
            setCurrentUser(data.currentUser);
            setPublicUsers(data.publicUsers || []);
            setUsers(data.users || []);
            setRunners(data.runners || []);
            setRequests(data.requests || []);
          } catch (bootstrapError) {
            setError(bootstrapError.message);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleLogin = async ({ userId, password }) => {
    const response = await api.login(userId, password);
    setSessionToken(response.token);
    setSessionTokenState(response.token);
    await refreshState(response.token);
    setView('dashboard');
  };

  const handleLogout = async () => {
    if (sessionToken) await api.logout(sessionToken).catch(() => { });
    clearSessionToken();
    setSessionTokenState('');
    setCurrentUser(null);
    setUsers([]);
    setPublicUsers([]);
    setRunners([]);
    setRequests([]);
    setView('dashboard');
    await refreshState('');
  };

  const handleCreateRequest = async requestPayload => {
    const response = await api.createRequest(sessionToken, requestPayload);
    await refreshState();
    return response;
  };

  const handleUpdateRequest = async updatedRequest => {
    await api.updateRequest(sessionToken, updatedRequest.id, updatedRequest);
    await refreshState();
  };

  const handleAddRunner = async runnerName => {
    await api.addRunner(sessionToken, runnerName);
    await refreshState();
  };

  const handleRemoveRunner = async runnerName => {
    await api.removeRunner(sessionToken, runnerName);
    await refreshState();
  };

  const handleAddDepartment = async departmentPayload => {
    const response = await api.addDepartment(sessionToken, departmentPayload);
    await refreshState();
    return response;
  };

  const handleRemoveDepartment = async userId => {
    await api.removeDepartment(sessionToken, userId);
    await refreshState();
  };

  const handleResetPassword = async (userId, password) => {
    const response = await api.resetDepartmentPassword(sessionToken, userId, password);
    await refreshState();
    return response;
  };

  const handleExportRequests = async () => {
    const csv = await api.exportRequests(sessionToken);
    downloadTextFile('z-track-requests.csv', csv, 'text/csv;charset=utf-8');
  };

  const employeeRequests = useMemo(
    () => requests.filter(request => request.employeeId === currentUser?.id),
    [requests, currentUser],
  );

  if (loading) return <LoadingScreen />;

  if (!currentUser) {
    return (
      <LoginScreen
        users={publicUsers}
        onLogin={handleLogin}
        errorBanner={error}
        clearError={() => setError('')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar user={currentUser} onLogout={handleLogout} setView={setView} />
      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8">
        {currentUser.role === 'Employee' ? (
          <EmployeePortal user={currentUser} requests={employeeRequests} view={view} setView={setView} onCreateRequest={handleCreateRequest} />
        ) : view === 'settings' && currentUser.role === 'Super Admin' ? (
          <AdminManagement
            users={users}
            runners={runners}
            onBack={() => setView('dashboard')}
            onAddRunner={handleAddRunner}
            onRemoveRunner={handleRemoveRunner}
            onAddDepartment={handleAddDepartment}
            onRemoveDepartment={handleRemoveDepartment}
            onResetPassword={handleResetPassword}
          />
        ) : (
          <AdminPortal user={currentUser} requests={requests} runners={runners} setView={setView} onUpdateRequest={handleUpdateRequest} onExport={handleExportRequests} />
        )}
      </main>
    </div>
  );
}
function LoginScreen({ users, onLogin, errorBanner, clearError }) {
  const [selectedUserId, setSelectedUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginState, setLoginState] = useState('idle'); // idle | pending | granted

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.role === 'Super Admin') return -1;
      if (b.role === 'Super Admin') return 1;
      if (a.role === 'Admin') return -1;
      if (b.role === 'Admin') return 1;
      return a.department.localeCompare(b.department);
    });
  }, [users]);

  const activeUserId = useMemo(() => {
    if (sortedUsers.some(user => user.id === selectedUserId)) {
      return selectedUserId;
    }
    return sortedUsers[0]?.id || '';
  }, [sortedUsers, selectedUserId]);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    clearError();
    setLoginState('pending');
    try {
      await api.login(activeUserId, password);
      setLoginState('granted');
      setTimeout(() => {
         onLogin({ userId: activeUserId, password });
      }, 1500);
    } catch (err) {
      setLoginState('idle');
      setError(err.message);
    }
  };

  return (
    <div className="login-theme">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');

        .login-theme {
          background-color: #F8F9FA;
          color: #181C26;
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }

        .auth-card {
          background-color: #ffffff;
          border-radius: 2.5rem;
          box-shadow: 0 20px 50px rgba(0,0,0,0.05);
          width: 100%;
          max-width: 400px;
          overflow: hidden;
          position: relative;
          animation: slideUp 0.6s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .card-header {
          background-color: #FCE36D;
          height: 280px;
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 2rem;
          overflow: hidden;
        }

        .header-bg-elements {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.3;
        }

        .courier-img {
          width: 85%;
          height: auto;
          position: relative;
          z-index: 2;
          filter: drop-shadow(0 10px 20px rgba(0,0,0,0.1));
        }

        .card-body {
          padding: 2.5rem 2rem;
        }

        .welcome-text {
          margin-bottom: 2rem;
        }

        .welcome-text h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: #181C26;
        }

        .welcome-text p {
          color: #718096;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .input-wrapper {
          position: relative;
          background-color: #F3F4F6;
          border-radius: 1.25rem;
          padding: 0.75rem 1.25rem;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .input-wrapper:focus-within {
          background-color: #ffffff;
          border-color: #FCE36D;
          box-shadow: 0 5px 15px rgba(252, 227, 109, 0.2);
        }

        .input-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #A0AEC0;
          text-transform: uppercase;
          margin-bottom: 0.25rem;
          display: block;
        }

        .input-field {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #181C26;
          font-size: 1rem;
          font-weight: 500;
        }

        .btn-login {
          width: 100%;
          background-color: #181C26;
          color: white;
          border: none;
          border-radius: 1.25rem;
          padding: 1.15rem;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .btn-login:hover {
          background-color: #2D3748;
          transform: translateY(-2px);
        }

        .btn-login:active {
          transform: translateY(0);
        }

        .btn-login.pending {
           background-color: #FCE36D;
           color: #181C26;
           pointer-events: none;
        }

        .success-overlay {
          position: absolute;
          inset: 0;
          background-color: #FCE36D;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .success-icon {
          width: 80px;
          height: 80px;
          background-color: #181C26;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          margin-bottom: 1.5rem;
          animation: scalePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes scalePop {
          0% { transform: scale(0.5); }
          100% { transform: scale(1); }
        }

        .dots-loader {
          display: flex;
          gap: 6px;
        }

        .dot {
          width: 8px;
          height: 8px;
          background-color: currentColor;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
      `}</style>

      <div className="auth-card">
        {loginState === 'granted' && (
          <div className="success-overlay">
            <div className="success-icon">✓</div>
            <h2 className="text-xl font-bold">Access Granted</h2>
            <p className="text-sm opacity-70">Redirecting to Z-Track...</p>
          </div>
        )}
        
        <div className="card-header overflow-hidden relative">
           <div className="header-bg-elements">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
              <div className="absolute top-20 -left-10 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
           </div>
           
           {/* Company Logo - Forced blending and removal of any white fragments */}
           <div className="absolute top-8 left-8 z-30 mix-blend-multiply">
             <img 
               src="https://www.zuarimoney.com/App_Themes/images/Zuari_whatsnew2.jpg" 
               alt="Zuari Logo" 
               className="h-14 object-contain contrast-[1.1]"
             />
           </div>

           {/* Local Courier Illustration Provided by User */}
           <div className="absolute inset-0 flex items-end justify-center z-10 p-4">
             <img 
               src="/courier.png" 
               alt="Delivery" 
               className="max-h-[90%] w-auto object-contain drop-shadow-2xl transition-transform duration-700 hover:scale-[1.05]"
             />
           </div>
        </div>

        <div className="card-body">
          <div className="flex flex-col items-center justify-center mb-10 pt-4">
             <h1 className="text-4xl font-black text-[#181C26] tracking-tighter uppercase italic">
               Z-Track<span className="text-[#FCE36D] animate-pulse">.</span>
             </h1>
             <div className="h-1.5 w-20 bg-[#FCE36D] mt-4 rounded-full"></div>
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mt-3 ml-2">Secure Logistics Portal</p>
          </div>

          <form onSubmit={handleSubmit}>
            {errorBanner && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {errorBanner}
              </div>
            )}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-medium rounded-r-lg animate-fade-in">
                {error}
              </div>
            )}

            <div className="form-group">
               <span className="input-label">Select Profile</span>
                <div className="input-wrapper">
                  <select 
                     className="input-field appearance-none cursor-pointer"
                     value={activeUserId}
                     onChange={event => setSelectedUserId(event.target.value)}
                     required
                  >
                    {sortedUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.role === 'Super Admin' || user.role === 'Admin' ? user.role : `${user.department} Dept.`} - {user.name}
                      </option>
                    ))}
                 </select>
               </div>
            </div>

            <div className="form-group">
               <span className="input-label">Password</span>
               <div className="input-wrapper">
                 <input 
                    type="password" 
                    className="input-field"
                    placeholder="Enter password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                 />
               </div>
            </div>

            <button 
              type="submit" 
              className={`btn-login ${loginState === 'pending' ? 'pending' : ''}`}
              disabled={loginState !== 'idle'}
            >
              {loginState === 'pending' ? (
                <div className="dots-loader">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              ) : (
                <>Sign In <ArrowRight size={20} /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
             <p className="text-sm text-gray-400">
               Need help? <a href="#" className="text-gray-600 font-bold hover:underline">Contact IT Support</a>
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Navbar({ user, onLogout, setView }) {
  return (
    <nav className="bg-[#181C26] border-b border-white/10 sticky top-0 z-30 shadow-2xl backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 h-20 flex items-center justify-between">
        <button className="flex items-center gap-4 cursor-pointer group" onClick={() => setView('dashboard')}>
          <div className="bg-white/95 p-2 rounded-xl backdrop-blur-md shadow-lg transition-transform group-hover:scale-105">
            <img src="https://www.zuarimoney.com/App_Themes/images/Zuari_whatsnew2.jpg" alt="Zuari Logo" className="h-10 w-auto object-contain mix-blend-multiply" />
          </div>
          <div className="h-8 w-px bg-white/10 hidden sm:block" />
          <div className="flex flex-col">
             <span className="text-xl font-black text-white tracking-tighter uppercase leading-none">Z-Track</span>
             <span className="text-[9px] font-black text-[#FCE36D] uppercase tracking-[0.2em] mt-1">Logistics</span>
          </div>
        </button>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-bold text-[#FCE36D]">{user.name}</span>
            <span className="text-[10px] text-white/50 uppercase tracking-widest font-black">{user.role}</span>
          </div>
          
          <div className="relative group">
            <div className="h-10 w-10 rounded-xl bg-[#FCE36D] flex items-center justify-center text-[#181C26] font-black border-2 border-[#FCE36D] shadow-[0_0_15px_rgba(252,227,109,0.3)] group-hover:shadow-[0_0_25px_rgba(252,227,109,0.5)] transition-all">
              {user.name.charAt(0)}
            </div>
          </div>
          
          <div className="h-8 w-px bg-white/10" />
          
          <button 
            onClick={onLogout} 
            className="text-white/60 hover:text-[#FCE36D] transition-all p-2.5 rounded-xl hover:bg-white/5 group"
            title="Logout"
          >
            <LogOut size={20} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </nav>
  );
}

function EmployeePortal({ requests, view, setView, onCreateRequest }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const itemsPerPage = 15;

  if (view === 'new-request') {
    return <NewRequestForm onBack={() => { setView('dashboard'); setCurrentPage(1); }} onSubmit={onCreateRequest} />;
  }

  const sortedRequests = [...requests].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRequests = sortedRequests.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  return (
    <div className="space-y-8 animate-entrance">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 p-8 bg-white/40 backdrop-blur-sm rounded-[2.5rem] border border-white/40 relative overflow-hidden">
        {/* Decorative background sticker */}
        <div className="absolute -right-10 -bottom-10 opacity-5 sticker-float hidden lg:block">
           <img src="/courier.png" alt="Sticker" className="w-[450px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-2 bg-[#FCE36D] rounded-full"></div>
            <h1 className="text-3xl font-black text-[#181C26] tracking-tighter uppercase italic">Active Operations</h1>
          </div>
          <p className="text-slate-500 font-medium italic">Tracing your document collection and delivery requests.</p>
        </div>

        <button onClick={() => setView('new-request')} className="btn-primary-courier bg-[#FCE36D] text-[#181C26] border-2 border-[#FCE36D] hover:bg-transparent relative z-10">
           <Plus size={18} /> Book New Dispatch
        </button>
      </div>

      <div className="card-premium overflow-hidden animate-entrance" style={{ animationDelay: '0.1s' }}>
        {requests.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 sticker-float">
               <img src="/courier.png" alt="Empty" className="w-14 grayscale opacity-30" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No active tracks</h3>
            <p className="text-slate-400 mb-8 max-w-xs mx-auto">You haven't initiated any delivery requests in this cycle.</p>
            <button onClick={() => setView('new-request')} className="btn-primary-courier bg-slate-100 text-[#181C26] hover:bg-[#FCE36D]">
              Launch Dispatch Form <Plus size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto min-h-[400px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#181C26] text-[#FCE36D] border-b border-[#181C26]">
                  <tr>
                    <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Reference ID</th>
                    <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Dispatch Date</th>
                    <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Logistics Type</th>
                    <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Status</th>
                    <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-right">Tracing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedRequests.map(request => (
                    <tr key={request.id} className="hover:bg-slate-50/80 transition-all duration-300 group">
                      <td className="px-8 py-4 font-bold text-[#181C26]">{request.id}</td>
                      <td className="px-8 py-4 text-slate-500 font-medium">{formatDate(request.date)}</td>
                      <td className="px-8 py-4 font-bold text-slate-700">{request.requestType}</td>
                      <td className="px-8 py-4">
                        <span className={`badge-courier ${STATUS_COLORS[request.status]} border-current`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="inline-flex items-center gap-2 px-6 py-2 bg-slate-100 text-[#181C26] rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-[#FCE36D] transition-all"
                        >
                          View Status
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination totalItems={sortedRequests.length} itemsPerPage={itemsPerPage} currentPage={safeCurrentPage} onPageChange={setCurrentPage} />
          </>
        )}
      </div>

      {selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title="Track Consignment"
        />
      )}
    </div>
  );
}

function NewRequestForm({ onBack, onSubmit }) {
  const initialFormState = {
    requestType: '',
    priority: '',
    pickupAddress: '',
    dropAddress: '',
    contactPerson: '',
    mobileNumber: '',
    meetingTiming: '',
    description: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newTicketId, setNewTicketId] = useState('');

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    const requiredFields = ['requestType', 'priority', 'pickupAddress', 'dropAddress', 'contactPerson', 'mobileNumber', 'meetingTiming', 'description'];
    const missingFields = requiredFields.filter(field => !String(formData[field] || '').trim());
    if (missingFields.length > 0) {
      setError('All request fields are required except the upload document.');
      return;
    }

    if (String(formData.mobileNumber).replace(/\D/g, '').length !== 10) {
      setError('Mobile number must be exactly 10 digits.');
      return;
    }

    if (!formData.meetingTiming || new Date(formData.meetingTiming) < new Date()) {
      setError('Meeting timing cannot be in the past.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await onSubmit(formData);
      setNewTicketId(response.request.id);
      setShowSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="max-w-2xl mx-auto mt-20 p-12 card-premium text-center animate-entrance relative overflow-hidden">
        {/* Success sticker */}
        <div className="absolute -right-16 -bottom-16 opacity-10 sticker-float w-48">
           <img src="/courier.png" alt="Sticker" />
        </div>

        <div className="w-24 h-24 bg-[#FCE36D] rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-[#FCE36D]/20">
          <CheckCircle className="text-[#181C26] w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-[#181C26] mb-4 tracking-tight">Request Logged!</h2>
        <p className="text-slate-500 font-medium mb-10 max-w-sm mx-auto">Your courier dispatch order has been successfully registered in our master log.</p>
        
        <div className="bg-[#181C26] p-8 rounded-[2rem] border border-[#181C26] mb-10 shadow-2xl relative z-10">
          <span className="text-xs font-black text-[#FCE36D]/70 block mb-3 uppercase tracking-[0.2em]">Booking Reference</span>
          <span className="text-4xl font-black text-[#FCE36D] tracking-widest drop-shadow-md">{newTicketId}</span>
        </div>
        
        <button onClick={onBack} className="btn-primary-courier mx-auto">
          Return to Hub <ArrowRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-entrance pb-10">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-[#181C26] transition-all font-black uppercase tracking-widest text-[10px] group">
          <div className="p-2 border border-slate-200 rounded-lg group-hover:border-[#181C26]">
            <ChevronRight className="rotate-180" size={16} />
          </div>
          Back to Hub
        </button>
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-[#FCE36D] rounded-full"></div>
          <span className="font-black text-[#181C26] uppercase tracking-[0.2em] text-[11px]">Dispatch Order Form</span>
        </div>
      </div>

      {error && (
        <div className="mb-8 p-5 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-3 animate-shake">
          <AlertCircle size={20} />
          <span className="text-sm font-bold tracking-tight">{error}</span>
        </div>
      )}

      <div className="card-premium overflow-hidden border-2 border-[#181C26]/5 shadow-2xl relative">
        {/* Decorative background sticker */}
        <div className="absolute -left-20 -bottom-20 opacity-5 sticker-float pointer-events-none">
           <img src="/courier.png" alt="Sticker" className="w-80" />
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-10 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Request Category</label>
              <select required value={formData.requestType} onChange={event => setFormData({ ...formData, requestType: event.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-[1.25rem] px-5 py-4 outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-slate-800 font-bold transition-all appearance-none cursor-pointer">
                <option value="" disabled>Select request category</option>
                <option value="Pick-up">Pick-up Only</option>
                <option value="Drop">Drop Only</option>
                <option value="Both">Both (Pick & Drop)</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Operational Priority</label>
              <select required value={formData.priority} onChange={event => setFormData({ ...formData, priority: event.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-[1.25rem] px-5 py-4 outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-slate-800 font-bold transition-all appearance-none cursor-pointer">
                <option value="" disabled>Select priority</option>
                <option value="Low">Low - Normal processing</option>
                <option value="Medium">Medium - Standard processing</option>
                <option value="High">High - URGENT ACTION NEEDED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Collection Address</label>
              <textarea required rows={3} value={formData.pickupAddress} onChange={event => setFormData({ ...formData, pickupAddress: event.target.value })} placeholder="Collection point full address..." className="w-full bg-slate-50 border border-slate-100 rounded-[1.25rem] px-5 py-4 outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-sm font-medium transition-all" />
            </div>
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Delivery Destination</label>
              <textarea required rows={3} value={formData.dropAddress} onChange={event => setFormData({ ...formData, dropAddress: event.target.value })} placeholder="Target destination full address..." className="w-full bg-slate-50 border border-slate-100 rounded-[1.25rem] px-5 py-4 outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-sm font-medium transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Person</label>
              <input required type="text" value={formData.contactPerson} onChange={event => setFormData({ ...formData, contactPerson: event.target.value })} placeholder="Full Name" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
            </div>
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Direct Mobile</label>
              <input required type="tel" value={formData.mobileNumber} onChange={event => setFormData({ ...formData, mobileNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit number" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
            </div>
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Schedule Timing</label>
              <input required type="datetime-local" min={minDateTime} value={formData.meetingTiming} onChange={event => setFormData({ ...formData, meetingTiming: event.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none flex-row-reverse" />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Manifest Details / Remarks</label>
            <textarea required rows={4} value={formData.description} onChange={event => setFormData({ ...formData, description: event.target.value })} placeholder="List document types or any package special instructions..." className="w-full bg-slate-50 border border-slate-100 rounded-[1.25rem] px-5 py-4 outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-sm font-medium transition-all" />
          </div>

          <div className="flex justify-end gap-3 pt-8 border-t border-slate-50">
            <button type="submit" disabled={isSubmitting} className="btn-primary-courier bg-[#181C26] text-[#FCE36D] px-10 py-5 rounded-[1.5rem] shadow-2xl hover:scale-105 active:scale-95 transition-all">
              {isSubmitting ? 'Logging Manifest...' : 'Initiate Dispatch Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminPortal({ user, requests, runners, setView, onUpdateRequest, onExport }) {
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', date: '' });
  const [editingRequest, setEditingRequest] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const updateFilters = patch => {
    setFilters(prev => ({ ...prev, ...patch }));
    setCurrentPage(1);
  };

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(request => ['Pending', 'Assigned', 'In Progress'].includes(request.status)).length;
    const highPriority = requests.filter(request => request.priority === 'High' && !['Completed', 'Cancelled'].includes(request.status)).length;
    const completed = requests.filter(request => request.status === 'Completed').length;
    return { total, pending, highPriority, completed };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter(request => {
        const search = filters.search.toLowerCase().trim();
        const matchSearch =
          !search ||
          request.id.toLowerCase().includes(search) ||
          request.employeeName.toLowerCase().includes(search) ||
          request.department.toLowerCase().includes(search);
        const matchStatus = filters.status ? request.status === filters.status : true;
        const matchPriority = filters.priority ? request.priority === filters.priority : true;
        const matchDate = filters.date ? request.date.startsWith(filters.date) : true;
        return matchSearch && matchStatus && matchPriority && matchDate;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [requests, filters]);

  const paginatedRequests = filteredRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = async () => {
    await onExport();
  };

  const handleSaveRequest = async request => {
    await onUpdateRequest(request);
    setEditingRequest(null);
  };

  return (
    <div className="space-y-8 animate-entrance pb-10 relative">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 p-8 bg-white/40 backdrop-blur-sm rounded-[2.5rem] border border-white/40 relative overflow-hidden animate-entrance">
        {/* Decorative background sticker */}
        <div className="absolute -right-10 -bottom-10 opacity-5 sticker-float hidden lg:block">
           <img src="/courier.png" alt="Sticker" className="w-[500px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-2 bg-[#FCE36D] rounded-full"></div>
            <h1 className="text-4xl font-black text-[#181C26] tracking-tighter uppercase italic">Control Hub</h1>
          </div>
          <p className="text-slate-500 font-medium pl-5 italic tracking-tight">Monitoring dispatch flow and delivery personnel overseen by {user.department || 'All Departments'}.</p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
          {user?.role === 'Super Admin' && (
            <button onClick={() => setView('settings')} className="btn-primary-courier bg-white text-[#181C26] border border-slate-200 hover:bg-[#FCE36D]">
               <Settings size={18} /> Architecture
            </button>
          )}
          <button onClick={handleExport} className="btn-primary-courier">
             <Download size={18} /> Export Manifest
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Requests" value={stats.total} icon={<FileText />} color="blue" />
        <StatCard title="Pending / Active" value={stats.pending} icon={<Clock />} color="yellow" />
        <StatCard title="Urgent High" value={stats.highPriority} icon={<AlertCircle />} color="purple" />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircle />} color="green" />
      </div>

      <div className="card-premium overflow-hidden animate-entrance relative z-10" style={{ animationDelay: '0.1s' }}>
        <div className="p-8 border-b border-slate-100/50 bg-[#181C26]/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="h-8 w-1.5 bg-[#181C26] rounded-full"></div>
             <h2 className="text-xl font-black text-[#181C26] tracking-tight uppercase">Operational Log</h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={filters.search}
                onChange={event => updateFilters({ search: event.target.value })}
                placeholder="Search Ticket ID or Employee..."
                className="w-full pl-10 pr-4 py-3 bg-white/60 border border-slate-200 rounded-[1.25rem] outline-none focus:ring-4 focus:ring-[#FCE36D]/30 focus:border-[#FCE36D] text-sm font-bold transition-all"
              />
            </div>
            <select
              value={filters.status}
              onChange={event => updateFilters({ status: event.target.value })}
              className="bg-white/60 border border-slate-200 rounded-[1.25rem] px-6 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-[#FCE36D]/30 transition-all cursor-pointer"
            >
              <option value="">All Statuses</option>
              {Object.keys(STATUS_COLORS).map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#181C26] text-[#FCE36D] border-b border-[#181C26]">
              <tr>
                <th className="px-8 py-6 font-black uppercase tracking-[0.2em] text-[10px]">Reference ID</th>
                <th className="px-8 py-6 font-black uppercase tracking-[0.2em] text-[10px]">Origin Client</th>
                <th className="px-8 py-6 font-black uppercase tracking-[0.2em] text-[10px]">Priority Index</th>
                <th className="px-8 py-6 font-black uppercase tracking-[0.2em] text-[10px]">Segment Status</th>
                <th className="px-8 py-6 font-black uppercase tracking-[0.2em] text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {paginatedRequests.map(request => (
                <tr key={request.id} className="hover:bg-white/60 transition-all duration-300 group">
                  <td className="px-8 py-5 font-black text-[#181C26]">{request.id}</td>
                  <td className="px-8 py-5">
                    <div className="font-bold text-[#181C26]">{request.employeeName}</div>
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{request.department}</div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`badge-courier ${PRIORITY_COLORS[request.priority]} border-current`}>
                      {request.priority}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`badge-courier ${STATUS_COLORS[request.status]} border-current`}>
                      {request.status}
                    </span>
                  </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                           <button
                             onClick={() => setSelectedRequest(request)}
                             className="inline-flex items-center gap-2 px-6 py-2 bg-slate-100 text-[#181C26] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#FCE36D] transition-all"
                           >
                             Trace
                           </button>
                           <button
                             onClick={() => {
                               if (!isFinalRequestStatus(request.status)) {
                                 setEditingRequest(request);
                               }
                             }}
                             disabled={isFinalRequestStatus(request.status)}
                             className={`inline-flex items-center gap-2 px-10 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                               isFinalRequestStatus(request.status)
                                 ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                 : 'bg-[#181C26] text-[#FCE36D] hover:scale-105 active:scale-95'
                             }`}
                             title={isFinalRequestStatus(request.status) ? 'Ticket is closed' : 'Update ticket'}
                           >
                             {isFinalRequestStatus(request.status) ? (
                               <>
                                 <Lock size={14} />
                                 Locked
                               </>
                             ) : (
                               <>
                                 Log <ArrowRight size={14} />
                               </>
                             )}
                           </button>
                        </div>
                      </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination totalItems={filteredRequests.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} />
      </div>

      {editingRequest && (
        <AdminEditModal request={editingRequest} runners={runners} onClose={() => setEditingRequest(null)} onSave={handleSaveRequest} />
      )}

      {selectedRequest && (
        <RequestDetailsModal request={selectedRequest} onClose={() => setSelectedRequest(null)} title="Segment Tracking" />
      )}
    </div>
  );
}

function AdminManagement({
  users,
  runners,
  onBack,
  onAddRunner,
  onRemoveRunner,
  onAddDepartment,
  onRemoveDepartment,
  onResetPassword,
}) {
  const [newRunner, setNewRunner] = useState('');
  const [newDept, setNewDept] = useState({ id: '', name: '', department: '', password: '' });
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const managedUsers = useMemo(
    () => users.filter(user => user.role === 'Employee' || user.role === 'Admin'),
    [users],
  );

  const handleAddRunner = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await onAddRunner(newRunner.trim());
      setNewRunner('');
      setNotice('Runner added successfully.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddDept = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const created = await onAddDepartment(newDept);
      setNewDept({ id: '', name: '', department: '', password: '' });
      setNotice(`Department added. Temporary password: ${created.temporaryPassword}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveRunnerClick = async runnerName => {
    setError('');
    setNotice('');
    try {
      await onRemoveRunner(runnerName);
      setNotice('Runner removed.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveDepartmentClick = async userId => {
    setError('');
    setNotice('');
    try {
      await onRemoveDepartment(userId);
      setNotice('Department removed.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenPasswordDialog = user => {
    setError('');
    setNotice('');
    setPasswordTarget(user);
    setPasswordDraft('');
  };

  const handleClosePasswordDialog = () => {
    setPasswordTarget(null);
    setPasswordDraft('');
  };

  const handleResetPasswordSubmit = async event => {
    event.preventDefault();
    if (!passwordTarget) return;

    setError('');
    setNotice('');
    try {
      const response = await onResetPassword(passwordTarget.id, passwordDraft.trim());
      handleClosePasswordDialog();
      setNotice(
        response.generated
          ? `Password reset. Temporary password: ${response.password}`
          : `Password updated for ${passwordTarget.id}.`,
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8 animate-entrance pb-10">
      <div className="flex items-center gap-4 bg-white/40 p-6 rounded-[2.5rem] border border-white/40 backdrop-blur-sm">
        <button onClick={onBack} className="p-3 bg-[#181C26] text-[#FCE36D] border border-[#181C26] rounded-xl hover:bg-transparent hover:text-[#181C26] transition-all group">
          <ChevronRight className="rotate-180 transition-transform group-hover:-translate-x-1" size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-[#181C26] tracking-tight">Portal Architecture</h1>
          <p className="text-slate-500 text-sm font-medium">Configure departments, credentials, and delivery infrastructure.</p>
        </div>
      </div>

      {(notice || error) && (
        <div className={`p-5 rounded-2xl border flex items-center gap-3 animate-slide-up ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-[#FCE36D] border-[#FCE36D] text-[#181C26] font-bold shadow-lg shadow-[#FCE36D]/20'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span className="text-sm tracking-tight">{error || notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="card-premium flex flex-col group relative overflow-hidden">
          <div className="p-6 border-b border-slate-50 bg-[#181C26] flex items-center gap-3">
            <Truck className="text-[#FCE36D]" size={22} />
            <h2 className="text-lg font-bold text-white tracking-tight">Fleet Command</h2>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <form onSubmit={handleAddRunner} className="flex flex-col gap-3 mb-8">
              <input 
                type="text" 
                value={newRunner} 
                onChange={event => setNewRunner(event.target.value)} 
                placeholder="Name of delivery runner..." 
                required 
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#FCE36D]/20 transition-all"
              />
              <button type="submit" className="btn-primary-courier w-full justify-center">Add to Fleet</button>
            </form>
            <div className="space-y-3 overflow-y-auto flex-1 max-h-[400px] navy-scroll pr-2">
              {runners.length === 0 ? (
                <div className="text-center py-10 text-slate-300 italic text-sm font-medium">No runners assigned</div>
              ) : runners.map(runner => (
                <div key={runner} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group/item hover:border-[#FCE36D] transition-all">
                  <span className="font-bold text-[#181C26] text-sm">{runner}</span>
                  <button onClick={() => handleRemoveRunnerClick(runner)} className="text-slate-300 hover:text-red-500 p-2 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 card-premium">
          <div className="p-6 border-b border-slate-50 bg-[#181C26] flex items-center gap-3">
            <Users className="text-[#FCE36D]" size={22} />
            <h2 className="text-lg font-bold text-white tracking-tight">Department Management</h2>
          </div>
          <div className="p-6">
            <div className="mb-8 p-6 bg-[#FCE36D]/10 rounded-2xl border-2 border-dashed border-[#FCE36D]">
              <h3 className="text-sm font-black text-[#181C26] uppercase tracking-widest mb-4">Add New Department Login</h3>
              <form onSubmit={handleAddDept} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Login ID (no spaces)</label>
                    <input type="text" value={newDept.id} onChange={event => setNewDept({ ...newDept, id: event.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="e.g. marketing" required className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none bg-white focus:ring-4 focus:ring-[#FCE36D]/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Department Name</label>
                    <input type="text" value={newDept.department} onChange={event => setNewDept({ ...newDept, department: event.target.value })} placeholder="e.g. Marketing" required className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none bg-white focus:ring-4 focus:ring-[#FCE36D]/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">User Full Name</label>
                    <input type="text" value={newDept.name} onChange={event => setNewDept({ ...newDept, name: event.target.value })} placeholder="e.g. Rahul Sharma" required className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none bg-white focus:ring-4 focus:ring-[#FCE36D]/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password (leave blank for auto)</label>
                    <input type="text" value={newDept.password || ''} onChange={event => setNewDept({ ...newDept, password: event.target.value })} placeholder="Auto-generated if empty" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none bg-white focus:ring-4 focus:ring-[#FCE36D]/20" />
                  </div>
                </div>
                <button type="submit" className="btn-primary-courier justify-center w-full md:w-auto">
                  <Plus size={16} /> Create Department Login
                </button>
              </form>
            </div>

            <div className="overflow-x-auto max-h-[500px] navy-scroll pr-2">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#181C26] text-[#FCE36D] sticky top-0 uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="px-5 py-4">Login ID</th>
                    <th className="px-5 py-4">Department</th>
                    <th className="px-5 py-4">User Name</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managedUsers.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-300 italic">No departments configured</td></tr>
                  ) : managedUsers.map(employee => (
                    <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-black text-[#181C26]">{employee.id}</td>
                      <td className="px-5 py-4 font-medium text-slate-600">{employee.department}</td>
                      <td className="px-5 py-4 font-medium text-slate-500">{employee.name || '—'}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleOpenPasswordDialog(employee)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
                            <Key size={12} /> Change Password
                          </button>
                          {employee.role === 'Employee' && (
                            <button onClick={() => handleRemoveDepartmentClick(employee.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors">
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {passwordTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/30">
            <div className="px-6 py-4 bg-[#181C26] text-white flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-2.5">
                  <Lock size={18} className="text-[#FCE36D]" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">Change Department Password</h2>
                  <p className="text-xs text-white/60 font-medium">{passwordTarget.id} - {passwordTarget.department}</p>
                </div>
              </div>
              <button onClick={handleClosePasswordDialog} className="text-white/60 hover:text-white transition-colors">
                <LogOut size={20} className="rotate-180" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">New Password</label>
                <input
                  type="text"
                  value={passwordDraft}
                  onChange={event => setPasswordDraft(event.target.value)}
                  placeholder="Enter the password you want to set"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none bg-white focus:ring-4 focus:ring-[#FCE36D]/20"
                />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Leave this blank if you want Z-Track to generate a temporary password automatically.
              </p>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePasswordDialog}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary-courier justify-center">
                  <Key size={16} />
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colorMap = {
    blue: 'bg-white/95 text-[#181C26] border-white/20',
    yellow: 'bg-[#FCE36D] text-[#181C26] border-[#FCE36D]',
    red: 'bg-red-50 text-red-600 border-red-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-[#181C26] text-[#FCE36D] border-white/10',
  };

  return (
    <div className={`card-premium p-8 flex items-center gap-6 group overflow-hidden relative animate-entrance ${color === 'purple' ? 'bg-[#181C26]/90 border-white/5' : ''}`}>
      <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.1] transition-all duration-700 transform group-hover:scale-150 rotate-12">
        {React.cloneElement(icon, { size: 100 })}
      </div>
      <div className={`p-5 rounded-[1.5rem] border-2 shadow-2xl transition-all group-hover:rotate-12 duration-500 z-10 ${colorMap[color]}`}>
        {React.cloneElement(icon, { size: 28, strokeWidth: 3 })}
      </div>
      <div className="relative z-10">
        <div className={`text-[10px] font-black uppercase tracking-[0.3em] mb-1.5 ${color === 'purple' ? 'text-[#FCE36D]/60' : 'text-slate-400'}`}>{title}</div>
        <div className={`text-4xl font-black tracking-tighter ${color === 'purple' ? 'text-white' : 'text-[#181C26]'}`}>{value}</div>
      </div>
    </div>
  );
}

function AdminEditModal({ request, runners, onClose, onSave }) {
  const [formData, setFormData] = useState({ ...request });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isLocked = isFinalRequestStatus(request.status);

  const handleSubmit = async event => {
    event.preventDefault();
    if (isLocked) {
      setError('This ticket is closed and cannot be modified.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div><h2 className="text-lg font-bold text-gray-800">Update Request: {request.id}</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><LogOut size={20} className="rotate-180" /></button>
        </div>
        <div className="overflow-y-auto p-6">
          {isLocked && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm font-medium flex items-center gap-2">
              <Lock size={16} />
              This ticket is closed. No further activity is allowed.
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <form id="update-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={event => setFormData({ ...formData, status: event.target.value })}
                  disabled={isLocked}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="Pending">Pending</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Runner</label>
                <select
                  value={formData.assignedPerson}
                  onChange={event => setFormData({ ...formData, assignedPerson: event.target.value })}
                  disabled={isLocked}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">-- Select Runner --</option>
                  {runners.map(runner => <option key={runner} value={runner}>{runner}</option>)}
                </select>
              </div>
            </div>
          </form>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium">Cancel</button>
          <button type="submit" form="update-form" disabled={saving || isLocked} className="px-6 py-2 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-70">
            {saving ? 'Saving...' : isLocked ? 'Locked' : 'Save Updates'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestDetailsModal({ request, onClose, title }) {
  const field = (label, value) => (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">{value || 'N/A'}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <p className="text-sm text-gray-500">{request.id} - {formatDate(request.date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <LogOut size={20} className="rotate-180" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {field('Ticket ID', request.id)}
            {field('Status', request.status)}
            {field('Assigned To', request.assignedPerson)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Employee', request.employeeName)}
            {field('Department', request.department)}
            {field('Request Type', request.requestType)}
            {field('Priority', request.priority)}
            {field('Contact Person', request.contactPerson)}
            {field('Mobile Number', request.mobileNumber)}
            {field('Meeting Timing', request.meetingTiming ? formatDate(request.meetingTiming) : '')}
            {field('Lineup Timing', request.lineupTiming ? formatDate(request.lineupTiming) : '')}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Pick-up Address', request.pickupAddress)}
            {field('Drop Address', request.dropAddress)}
          </div>

          {field('Description', request.description)}
          {field('Admin Comments', request.adminComments)}
          {request.completionDate && field('Completion Date', formatDate(request.completionDate))}
        </div>
      </div>
    </div>
  );
}
