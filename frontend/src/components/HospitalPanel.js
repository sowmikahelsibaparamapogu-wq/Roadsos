import React from 'react';

export default function HospitalPanel({ hospitals, loading, location, onRefresh }) {
  if (loading) {
    return (
      <div className="hospital-panel">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Finding nearby hospitals...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="hospital-panel">
      <div className="panel-header">
        <h2>🏥 Nearby Hospitals</h2>
        <button className="refresh-icon-btn" onClick={onRefresh}>🔄 Refresh</button>
      </div>

      {!location && (
        <div className="no-hospitals">
          <h3>📍 Location Required</h3>
          <p>Please allow location access to find nearby hospitals in real-time.</p>
          <a href="tel:112" className="emergency-link">📞 Call 112 Emergency</a>
        </div>
      )}

      {location && hospitals.length === 0 && (
        <div className="no-hospitals">
          <h3>No hospitals found nearby</h3>
          <p>Try refreshing or expanding the search area. You can also call 112 for emergency assistance.</p>
          <button className="refresh-icon-btn" onClick={onRefresh}>🔄 Try Again</button>
          <a href="tel:112" className="emergency-link" style={{ marginTop: 12 }}>📞 Call 112</a>
        </div>
      )}

      <div className="hospitals-grid">
        {hospitals.map((h, i) => (
          <div key={i} className={`hospital-card ${i === 0 ? 'nearest' : ''}`}>
            {i === 0 && <div className="nearest-badge">Nearest</div>}
            <div className="h-row1">
              <div className="h-name">{h.name}</div>
              <div className="h-dist">{h.distance_km} km</div>
            </div>
            {h.address && <div className="h-address">📍 {h.address}</div>}
            {h.rating && (
              <div className="h-rating">⭐ {h.rating}/5</div>
            )}
            {h.open_now !== undefined && (
              <div className={`h-open ${h.open_now ? 'open' : 'closed'}`}>
                {h.open_now ? '🟢 Open now' : '🔴 Closed'}
              </div>
            )}
            <div className="h-actions">
              <a className="h-btn h-btn-call" href={`tel:${h.phone || '112'}`}>
                📞 Call {h.phone || '112'}
              </a>
              {h.maps_url && (
                <a className="h-btn h-btn-maps" href={h.maps_url} target="_blank" rel="noreferrer">
                  🗺️ Directions
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {hospitals.length > 0 && (
        <div className="hospital-footer">
          <p>📡 Live data from OpenStreetMap · Updated on location change</p>
          <div className="emergency-row">
            <a href="tel:112" className="em-btn">📞 112</a>
            <a href="tel:102" className="em-btn">🚑 102</a>
            <a href="tel:108" className="em-btn">🏥 108</a>
          </div>
        </div>
      )}
    </div>
  );
}
