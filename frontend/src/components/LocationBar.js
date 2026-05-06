import React from 'react';

export default function LocationBar({ address, location, locationError, onRefresh }) {
  return (
    <div className="location-bar">
      <span className="loc-icon">{locationError ? '⚠️' : location ? '📍' : '🔄'}</span>
      <span className={`loc-address ${locationError ? 'loc-error' : ''}`}>{address}</span>
      {location && (
        <span className="loc-coords">
          {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
        </span>
      )}
      <button className="refresh-btn" onClick={onRefresh} title="Refresh location">
        🔄 Refresh
      </button>
    </div>
  );
}
