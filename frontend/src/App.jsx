import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const socket = io('/', { path: '/socket.io' });

function App() {
  const [tickets, setTickets] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0 });
  const feedRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('[WS] Connected');
      setIsConnected(true);
    });

    socket.on('connect_error', () => setIsConnected(false));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('ticket_update', (data) => {
      console.log('[WS] ticket_update:', data);
      setTickets((prev) => {
        const updated = prev.map((t) =>
          t.userId === data.userId
            ? { ...t, status: 'Confirmed', ticketId: data.ticketId, confirmedAt: new Date() }
            : t
        );
        return updated;
      });
    });

    return () => {
      socket.off('ticket_update');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
    };
  }, []);

  useEffect(() => {
    setStats({
      total: tickets.length,
      pending: tickets.filter((t) => t.status === 'Pending').length,
      confirmed: tickets.filter((t) => t.status === 'Confirmed').length,
    });
  }, [tickets]);

  const purchaseTicket = async () => {
    const userId = `user_${Math.random().toString(36).slice(2, 10)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newTicket = {
      requestId,
      userId,
      status: 'Pending',
      event: 'Formula 1',
      createdAt: new Date(),
      ticketId: null,
      confirmedAt: null,
    };

    setTickets((prev) => [newTicket, ...prev]);
    setIsLoading(true);

    try {
      await axios.post('/api/ticket', { userId, event: 'Formula 1', requestId });
    } catch (err) {
      console.error('[API] Error:', err);
      setTickets((prev) =>
        prev.map((t) => (t.requestId === requestId ? { ...t, status: 'Failed' } : t))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const statusConfig = {
    Pending: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)', icon: '[P]' },
    Confirmed: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.3)', icon: '[OK]' },
    Failed: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', icon: '[ERR]' },
  };

  return (
    <div style={styles.container}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0f0f1a; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Ticket Command Center</h1>
            <p style={styles.subtitle}>Real-time distributed ticket processing pipeline</p>
          </div>
          <div style={{
            ...styles.connectionBadge,
            background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderColor: isConnected ? '#10b981' : '#ef4444',
          }}>
            <span style={{
              ...styles.connectionDot,
              background: isConnected ? '#10b981' : '#ef4444',
              animation: isConnected ? 'pulse 2s infinite' : 'none',
            }} />
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{stats.total}</span>
          <span style={styles.statLabel}>Total</span>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #f59e0b' }}>
          <span style={{ ...styles.statValue, color: '#f59e0b' }}>{stats.pending}</span>
          <span style={styles.statLabel}>Pending</span>
        </div>
        <div style={{ ...styles.statCard, borderLeft: '3px solid #10b981' }}>
          <span style={{ ...styles.statValue, color: '#10b981' }}>{stats.confirmed}</span>
          <span style={styles.statLabel}>Confirmed</span>
        </div>
      </div>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Control Panel */}
        <div style={styles.controlPanel}>
          <h2 style={styles.sectionTitle}>New Purchase</h2>
          <button
            onClick={purchaseTicket}
            disabled={isLoading || !isConnected}
            style={{
              ...styles.purchaseBtn,
              opacity: isLoading || !isConnected ? 0.5 : 1,
              cursor: isLoading || !isConnected ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>*</span>
                Processing...
              </>
            ) : (
              <>Purchase Ticket</>
            )}
          </button>
          {!isConnected && (
            <p style={styles.warningText}>[WARN] Gateway disconnected -- will retry automatically</p>
          )}
        </div>

        {/* Activity Feed */}
        <div style={styles.feedSection}>
          <h2 style={styles.sectionTitle}>
            Activity Feed
            <span style={styles.feedCount}>{tickets.length}</span>
          </h2>

          {tickets.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={{ margin: 0, color: '#6b7280' }}>No tickets yet. Click "Purchase Ticket" to begin.</p>
            </div>
          ) : (
            <div ref={feedRef} style={styles.feedGrid}>
              {tickets.map((ticket) => {
                const cfg = statusConfig[ticket.status] || statusConfig.Pending;
                return (
                  <div
                    key={ticket.requestId}
                    style={{
                      ...styles.ticketCard,
                      background: cfg.bg,
                      borderColor: cfg.border,
                      animation: 'fadeIn 0.3s ease-out',
                    }}
                  >
                    {/* Status Header */}
                    <div style={styles.cardHeader}>
                      <span style={{
                        ...styles.statusBadge,
                        background: cfg.color,
                        color: ticket.status === 'Pending' ? '#000' : '#fff',
                      }}>
                        {cfg.icon} {ticket.status}
                      </span>
                      <span style={styles.timestamp}>
                        {ticket.createdAt.toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Request ID */}
                    <div style={styles.cardField}>
                      <span style={styles.fieldLabel}>Request ID</span>
                      <code style={styles.fieldValue}>{ticket.requestId}</code>
                    </div>

                    {/* User ID */}
                    <div style={styles.cardField}>
                      <span style={styles.fieldLabel}>User</span>
                      <span style={styles.fieldValue}>{ticket.userId}</span>
                    </div>

                    {/* Event */}
                    <div style={styles.cardField}>
                      <span style={styles.fieldLabel}>Event</span>
                      <span style={styles.fieldValue}>{ticket.event}</span>
                    </div>

                    {/* Confirmed Ticket ID */}
                    {ticket.ticketId && (
                      <div style={{
                        ...styles.cardField,
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        marginTop: '4px',
                      }}>
                        <span style={styles.fieldLabel}>Ticket ID</span>
                        <code style={{ ...styles.fieldValue, color: '#10b981' }}>{ticket.ticketId}</code>
                      </div>
                    )}

                    {/* Confirmed timestamp */}
                    {ticket.confirmedAt && (
                      <div style={styles.confirmedTime}>
                        Confirmed at {ticket.confirmedAt.toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: 'rgba(15, 15, 26, 0.8)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(100, 100, 140, 0.2)',
    padding: '20px 0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  connectionBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  connectionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statsBar: {
    maxWidth: '1200px',
    margin: '24px auto 0',
    padding: '0 24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  statCard: {
    background: 'rgba(30, 30, 50, 0.6)',
    border: '1px solid rgba(100, 100, 140, 0.15)',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  main: {
    maxWidth: '1200px',
    margin: '24px auto',
    padding: '0 24px',
  },
  controlPanel: {
    background: 'rgba(30, 30, 50, 0.6)',
    border: '1px solid rgba(100, 100, 140, 0.15)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#94a3b8',
  },
  purchaseBtn: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff',
    border: 'none',
    padding: '12px 28px',
    fontSize: '0.95rem',
    fontWeight: 600,
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  warningText: {
    margin: 0,
    color: '#ef4444',
    fontSize: '0.85rem',
  },
  feedSection: {
    marginBottom: '40px',
  },
  feedCount: {
    marginLeft: '8px',
    background: 'rgba(100, 100, 140, 0.2)',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '0.85rem',
    color: '#94a3b8',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'rgba(30, 30, 50, 0.3)',
    border: '1px dashed rgba(100, 100, 140, 0.2)',
    borderRadius: '12px',
  },
  feedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  ticketCard: {
    border: '1px solid',
    borderRadius: '12px',
    padding: '16px',
    transition: 'all 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  timestamp: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  cardField: {
    marginBottom: '8px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '2px',
  },
  fieldValue: {
    fontSize: '0.875rem',
    color: '#e2e8f0',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  confirmedTime: {
    marginTop: '8px',
    fontSize: '0.75rem',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
};

export default App;
