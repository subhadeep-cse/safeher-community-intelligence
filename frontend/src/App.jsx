import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import ReportsPage from './pages/ReportsPage';
import ReportModal from './components/ReportModal';
import { fetchIncidents, createIncident } from './services/api';
import { AlertTriangle, Map, List, Plus } from 'lucide-react';
import './index.css';

function Layout({ children, onOpenModal }) {
  const location = useLocation();
  const [theme, setTheme] = useState('night');

  const toggleTheme = () => {
    const newTheme = theme === 'night' ? 'day' : 'night';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-layout">
      <nav className="glass-panel" style={{ padding: '15px 30px', margin: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle color="var(--color-primary)" size={32} />
          <h1 style={{ fontSize: '24px', margin: 0 }}>SafeHer <span style={{ color: 'var(--color-primary)' }}>Community</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link to="/" style={{ color: location.pathname === '/' ? 'var(--color-primary)' : 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Map size={20} /> Dashboard
          </Link>
          <Link to="/reports" style={{ color: location.pathname === '/reports' ? 'var(--color-primary)' : 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <List size={20} /> Community Reports
          </Link>
          <button onClick={toggleTheme} className="glass-panel" style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', borderRadius: '8px', color: 'var(--text-primary)' }}>
            {theme === 'night' ? '☀️ Day Mode' : '🌙 Night Mode'}
          </button>
        </div>
      </nav>

      <main className="container animate-fade-in">
        {children}
      </main>

      <button 
        onClick={onOpenModal}
        className="btn-primary glow-effect" 
        style={{ position: 'fixed', bottom: '40px', right: '40px', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 20px rgba(255,107,74,0.5)', zIndex: 1000 }}
      >
        <Plus size={32} />
      </button>
    </div>
  );
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      const data = await fetchIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load incidents. Please check connection.");
      toast.error("Failed to load incidents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleIncidentUpdated = (updatedIncident) => {
    setIncidents(prev => prev.map(inc => inc.id === updatedIncident.id ? updatedIncident : inc));
  };

  const handleReportSubmit = async (formData) => {
    const toastId = toast.loading('Submitting report...');
    try {
      const newIncident = await createIncident(formData);
      setIsModalOpen(false);
      
      // Update local state without full reload
      setIncidents(prev => [newIncident, ...prev]);
      setMapCenter([newIncident.latitude, newIncident.longitude]);
      
      toast.success('Report submitted successfully!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit report. Please try again.', { id: toastId });
    }
  };

  return (
    <Router>
      <Toaster position="top-right" toastOptions={{ 
        style: { background: '#333', color: '#fff', borderRadius: '8px' }
      }} />
      <Layout onOpenModal={() => setIsModalOpen(true)}>
        <Routes>
          <Route path="/" element={<Dashboard incidents={incidents} loading={loading} error={error} onIncidentUpdated={handleIncidentUpdated} mapCenter={mapCenter} />} />
          <Route path="/reports" element={<ReportsPage incidents={incidents} loading={loading} error={error} onIncidentUpdated={handleIncidentUpdated} />} />
        </Routes>
      </Layout>

      {isModalOpen && (
        <ReportModal 
          onClose={() => setIsModalOpen(false)} 
          onSubmit={handleReportSubmit} 
        />
      )}
    </Router>
  );
}

export default App;
