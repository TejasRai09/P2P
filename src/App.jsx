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

const BrandLogo = ({ className = '', size = 'lg' }) => {
  const isSm = size === 'sm';
  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <div className={`relative flex items-center justify-center bg-white shadow-md shadow-blue-500/10 border border-blue-100 ${isSm ? 'w-8 h-8 rounded-[0.6rem]' : 'w-12 h-12 rounded-2xl'}`}>
        <svg className={`text-blue-600 relative z-10 ${isSm ? 'w-4 h-4' : 'w-6 h-6'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="19" r="2.5" fill="currentColor" stroke="none" />
          <circle cx="19" cy="5" r="2.5" fill="currentColor" stroke="none" />
          <path d="M6.5 17.5L17.5 6.5" strokeDasharray="3 4" opacity="0.6" />
          <path d="M11 5h8v8" />
        </svg>
        <div className={`absolute inset-0 bg-gradient-to-tr from-blue-100/40 to-indigo-50/20 ${isSm ? 'rounded-[0.6rem]' : 'rounded-2xl'} pointer-events-none`} />
      </div>
      <div className={`font-extrabold tracking-tight flex items-center ${isSm ? 'text-xl' : 'text-[1.75rem]'}`}>
        <span className="text-slate-800">Point</span>
        <span className={`bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center rounded-md mx-[0.2rem] ${isSm ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-base'} shadow-sm`}>2</span>
        <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-600">Point</span>
      </div>
    </div>
  );
};

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded-full bg-blue-400 animate-pulse" />
        <div className="text-sm tracking-wide uppercase text-slate-300">Loading Point2Point</div>
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
    setView('dashboard');
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
  };

  const handleLogout = async () => {
    if (sessionToken) await api.logout(sessionToken).catch(() => {});
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

  const handleResetPassword = async userId => {
    const response = await api.resetDepartmentPassword(sessionToken, userId);
    await refreshState();
    return response.password;
  };

  const handleExportRequests = async () => {
    const csv = await api.exportRequests(sessionToken);
    downloadTextFile('point2point-requests.csv', csv, 'text/csv;charset=utf-8');
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
        ) : view === 'settings' ? (
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
          <AdminPortal requests={requests} runners={runners} setView={setView} onUpdateRequest={handleUpdateRequest} onExport={handleExportRequests} />
        )}
      </main>
    </div>
  );
}

function LoginScreen({ users, onLogin, errorBanner, clearError }) {
  const [selectedUserId, setSelectedUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.role === 'Admin') return -1;
      if (b.role === 'Admin') return 1;
      return a.department.localeCompare(b.department);
    });
  }, [users]);

  useEffect(() => {
    if (sortedUsers.length > 0 && !sortedUsers.some(user => user.id === selectedUserId)) {
      setSelectedUserId(sortedUsers[0].id);
    }
  }, [sortedUsers, selectedUserId]);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    clearError();
    setSubmitting(true);
    try {
      await onLogin({ userId: selectedUserId, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes slowGradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-bg { background-size: 200% 200%; animation: slowGradient 15s ease infinite; }
          .corporate-pattern { background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.5px, transparent 1.5px); background-size: 24px 24px; }
        `}
      </style>
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 animate-bg">
        <div className="absolute inset-0 corporate-pattern" />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[25%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
          <div className="absolute -bottom-[25%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]" />
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] w-full max-w-md relative z-10 overflow-hidden ring-1 ring-black/5 animate-fade-in">
          <div className="bg-white p-7 text-center border-b border-gray-100">
            <div className="flex items-center justify-between mb-8 gap-3">
              <img src="https://www.zuarimoney.com/App_Themes/images/Zuari_whatsnew2.jpg" alt="Zuari Logo" className="h-10 object-contain" />
              <img src="https://www.zuariindustries.in/assets/web/img/logo/adventz.png" alt="Adventz Logo" className="h-10 object-contain" />
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <BrandLogo size="lg" />
              <p className="text-gray-500 mt-3 text-[0.65rem] font-bold tracking-widest uppercase">Document Logistics Portal</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-7 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-800 mb-6 text-center">Login to Portal</h2>
            {(error || errorBanner) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error || errorBanner}</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Select Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <select
                    value={selectedUserId}
                    onChange={event => setSelectedUserId(event.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 font-medium transition-all shadow-sm"
                  >
                    {sortedUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.role === 'Admin' ? 'Administrator' : `${user.department} Dept.`} - {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 transition-all shadow-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white mt-2 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {submitting ? 'Signing in...' : 'Sign In'} <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function Navbar({ user, onLogout, setView }) {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button className="flex items-center gap-4 cursor-pointer" onClick={() => setView('dashboard')}>
          <img src="https://www.zuarimoney.com/App_Themes/images/Zuari_whatsnew2.jpg" alt="Zuari Logo" className="h-8 object-contain max-w-[110px]" />
          <div className="h-6 w-px bg-gray-200 hidden sm:block" />
          <BrandLogo size="sm" className="hidden sm:flex" />
        </button>
        <div className="flex items-center gap-3 sm:gap-4 self-end sm:self-auto">
          <img src="https://www.zuariindustries.in/assets/web/img/logo/adventz.png" alt="Adventz Logo" className="h-8 object-contain hidden md:block mr-2" />
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-semibold text-gray-800">{user.name}</span>
            <span className="text-xs text-gray-500">{user.role}{user.department ? ` - ${user.department}` : ''}</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
            {user.name.charAt(0)}
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <button onClick={onLogout} className="text-gray-500 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50" title="Logout">
            <LogOut size={20} />
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Requests</h1>
          <p className="text-gray-500 text-sm">Track and manage your document collection and delivery requests.</p>
        </div>
        <button onClick={() => setView('new-request')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all">
          <Plus size={18} /> New Request
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mb-4">
              <FileText className="text-gray-300 w-10 h-10" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-1">No requests found</h3>
            <p className="text-gray-500 mb-6">You have not created any Point2Point requests yet.</p>
            <button onClick={() => setView('new-request')} className="text-blue-600 font-medium hover:underline flex items-center gap-1">
              Create your first request <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {paginatedRequests.map(request => (
                <div key={request.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{request.id}</div>
                      <div className="text-xs text-gray-500">{formatDate(request.date)}</div>
                    </div>
                    <button
                      onClick={() => setSelectedRequest(request)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm"
                    >
                      View
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Type</div>
                      <div className="font-medium text-gray-800">{request.requestType}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Priority</div>
                      <Badge className={PRIORITY_COLORS[request.priority] || ''}>{request.priority}</Badge>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
                      <Badge className={STATUS_COLORS[request.status] || ''}>{request.status}</Badge>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">Assigned</div>
                      <div className="font-medium text-gray-800">{request.assignedPerson || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto min-h-[400px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Ticket ID</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Priority</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Assigned To</th>
                    <th className="px-6 py-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRequests.map(request => (
                    <tr key={request.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{request.id}</td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(request.date)}</td>
                      <td className="px-6 py-4 text-gray-700">{request.requestType}</td>
                      <td className="px-6 py-4"><Badge className={PRIORITY_COLORS[request.priority] || ''}>{request.priority}</Badge></td>
                      <td className="px-6 py-4"><Badge className={STATUS_COLORS[request.status] || ''}>{request.status}</Badge></td>
                      <td className="px-6 py-4 text-gray-700">{request.assignedPerson || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
                        >
                          View
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
          title="Request Details"
        />
      )}
    </div>
  );
}

function NewRequestForm({ onBack, onSubmit }) {
  const initialFormState = {
    requestType: 'Pick-up',
    priority: 'Medium',
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
      <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-sm border border-gray-100 text-center animate-fade-in">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="text-green-600 w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Request Submitted!</h2>
        <p className="text-gray-500 mb-8">Your logistics request has been successfully registered.</p>
        <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 mb-8">
          <span className="text-sm font-medium text-blue-800 block mb-2 uppercase tracking-wide">Ticket Reference Number</span>
          <span className="text-3xl font-bold text-blue-600 tracking-wider">{newTicketId}</span>
        </div>
        <button onClick={onBack} className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">Go to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-10">
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 mb-6 font-medium">
        <ChevronRight className="rotate-180" size={18} /> Back
      </button>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} />
          {error}
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Request Type *</label>
              <select required value={formData.requestType} onChange={event => setFormData({ ...formData, requestType: event.target.value })} className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
                <option value="Pick-up">Pick-up</option>
                <option value="Drop">Drop</option>
                <option value="Both">Both</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority Type *</label>
              <select required value={formData.priority} onChange={event => setFormData({ ...formData, priority: event.target.value })} className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-gray-700">
                <option value="Low">Low - Normal processing</option>
                <option value="Medium">Medium - Standard processing</option>
                <option value="High">High - Urgent attention needed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <textarea required rows={2} value={formData.pickupAddress} onChange={event => setFormData({ ...formData, pickupAddress: event.target.value })} placeholder="Pick-up Address *" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
            <textarea required rows={2} value={formData.dropAddress} onChange={event => setFormData({ ...formData, dropAddress: event.target.value })} placeholder="Drop Address *" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
            <input required type="text" value={formData.contactPerson} onChange={event => setFormData({ ...formData, contactPerson: event.target.value })} placeholder="Contact Person Name *" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
            <input required type="tel" value={formData.mobileNumber} onChange={event => setFormData({ ...formData, mobileNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit Mobile Number *" className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
            <input required type="datetime-local" min={minDateTime} value={formData.meetingTiming} onChange={event => setFormData({ ...formData, meetingTiming: event.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
          </div>
          <textarea required rows={3} value={formData.description} onChange={event => setFormData({ ...formData, description: event.target.value })} placeholder="Description / Remarks *" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm" />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-sm transition-all">
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminPortal({ requests, runners, setView, onUpdateRequest, onExport }) {
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
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm">Overview and management of all logistics requests.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setView('settings')} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm transition-all">
            <Settings size={18} /> Settings
          </button>
          <button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm transition-all">
            <Download size={18} /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Requests" value={stats.total} icon={<FileText />} color="blue" />
        <StatCard title="Pending / Active" value={stats.pending} icon={<Clock />} color="yellow" />
        <StatCard title="High Priority" value={stats.highPriority} icon={<AlertCircle />} color="red" />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircle />} color="green" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                value={filters.search}
                onChange={event => updateFilters({ search: event.target.value })}
                placeholder="Search ticket, employee, or department..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <select value={filters.status} onChange={event => updateFilters({ status: event.target.value })} className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <div className="flex gap-3">
              <select value={filters.priority} onChange={event => updateFilters({ priority: event.target.value })} className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                <option value="">All Priorities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <input type="date" value={filters.date} onChange={event => updateFilters({ date: event.target.value })} className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none bg-white" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Filter size={14} />
            <span>Filters are applied instantly. Clearing search returns the full request history.</span>
          </div>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {paginatedRequests.map(request => (
            <div key={request.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-blue-600">{request.id}</div>
                  <div className="text-xs text-gray-500">{request.employeeName} - {request.department}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedRequest(request)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
                    View
                  </button>
                  <button onClick={() => setEditingRequest(request)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm">
                    Edit
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Date</div>
                  <div className="font-medium text-gray-800">{formatDate(request.date)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Assigned</div>
                  <div className="font-medium text-gray-800">{request.assignedPerson || '-'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Priority</div>
                  <Badge className={PRIORITY_COLORS[request.priority] || ''}>{request.priority}</Badge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
                  <Badge className={STATUS_COLORS[request.status] || ''}>{request.status}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-100">
              <tr>
                <th className="px-5 py-4 font-semibold">Ticket ID</th>
                <th className="px-5 py-4 font-semibold">Employee</th>
                <th className="px-5 py-4 font-semibold">Date & Time</th>
                <th className="px-5 py-4 font-semibold">Priority</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Assigned To</th>
                <th className="px-5 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRequests.map(request => (
                <tr key={request.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-blue-600">{request.id}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{request.employeeName}</div>
                    <div className="text-xs text-gray-500">{request.department}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(request.date)}</td>
                  <td className="px-5 py-3"><Badge className={PRIORITY_COLORS[request.priority] || ''}>{request.priority}</Badge></td>
                  <td className="px-5 py-3"><Badge className={STATUS_COLORS[request.status] || ''}>{request.status}</Badge></td>
                  <td className="px-5 py-3 text-gray-700">{request.assignedPerson || '-'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => setSelectedRequest(request)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm">
                        View
                      </button>
                      <button onClick={() => setEditingRequest(request)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm">
                        <Edit size={14} /> Update
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
        <RequestDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title="Request Details"
        />
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
  const [newDept, setNewDept] = useState({ id: '', name: '', department: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const employees = useMemo(() => users.filter(user => user.role === 'Employee'), [users]);

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
      setNewDept({ id: '', name: '', department: '' });
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

  const handleResetPasswordClick = async userId => {
    setError('');
    setNotice('');
    try {
      const password = await onResetPassword(userId);
      setNotice(`Password reset. Temporary password: ${password}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          <ChevronRight className="rotate-180" size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Portal Settings & Management</h1>
          <p className="text-gray-500 text-sm">Manage departments, access credentials, and delivery personnel.</p>
        </div>
      </div>

      {(notice || error) && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{error || notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
            <Truck className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Manage Runners</h2>
          </div>
          <div className="p-5 flex-1 flex flex-col">
            <form onSubmit={handleAddRunner} className="flex flex-col sm:flex-row gap-2 mb-6">
              <input type="text" value={newRunner} onChange={event => setNewRunner(event.target.value)} placeholder="New runner name..." required className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add</button>
            </form>
            <div className="space-y-2 overflow-y-auto flex-1 max-h-[400px]">
              {runners.map(runner => (
                <div key={runner} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="font-medium text-gray-800 text-sm">{runner}</span>
                  <button onClick={() => handleRemoveRunnerClick(runner)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
            <Users className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Manage Departments (Logins)</h2>
          </div>
          <div className="p-5">
            <form onSubmit={handleAddDept} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <input type="text" value={newDept.id} onChange={event => setNewDept({ ...newDept, id: event.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="Login ID (e.g. mktg)" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="text" value={newDept.department} onChange={event => setNewDept({ ...newDept, department: event.target.value })} placeholder="Dept Name (e.g. Marketing)" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="text" value={newDept.name} onChange={event => setNewDept({ ...newDept, name: event.target.value })} placeholder="User Name" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
              <button type="submit" className="bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 h-full">Add Department</button>
            </form>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Login ID</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Password Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(employee => (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{employee.id}</td>
                      <td className="px-4 py-3 text-gray-700">{employee.department}</td>
                      <td className="px-4 py-3 text-gray-600">{employee.passwordStatus || 'Stored securely'}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => handleResetPasswordClick(employee.id)} title="Reset Password" className="text-gray-500 hover:text-blue-600 p-1.5 bg-white border border-gray-200 rounded hover:bg-blue-50 inline-flex">
                          <Key size={14} />
                        </button>
                        <button onClick={() => handleRemoveDepartmentClick(employee.id)} title="Remove Dept" className="text-gray-500 hover:text-red-600 p-1.5 bg-white border border-gray-200 rounded hover:bg-red-50 inline-flex">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`p-3 rounded-xl border ${colorMap[color]}`}>{React.cloneElement(icon, { size: 24 })}</div>
      <div>
        <div className="text-sm font-medium text-gray-500">{title}</div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
      </div>
    </div>
  );
}

function AdminEditModal({ request, runners, onClose, onSave }) {
  const [formData, setFormData] = useState({ ...request });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async event => {
    event.preventDefault();
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
                <select value={formData.status} onChange={event => setFormData({ ...formData, status: event.target.value })} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none">
                  <option value="Pending">Pending</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Runner</label>
                <select value={formData.assignedPerson} onChange={event => setFormData({ ...formData, assignedPerson: event.target.value })} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none">
                  <option value="">-- Select Runner --</option>
                  {runners.map(runner => <option key={runner} value={runner}>{runner}</option>)}
                </select>
              </div>
            </div>
          </form>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-gray-300 text-gray-700 font-medium">Cancel</button>
          <button type="submit" form="update-form" disabled={saving} className="px-6 py-2 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-70">
            {saving ? 'Saving...' : 'Save Updates'}
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
