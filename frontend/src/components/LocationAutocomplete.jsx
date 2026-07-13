import React, { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, MapPin } from 'lucide-react';
import { searchLocation } from '../services/api';

const LocationAutocomplete = ({ 
  placeholder, 
  onSelect, 
  className = "glass-panel", 
  style = { padding: '10px 15px', borderRadius: '12px' },
  customInputStyle = {},
  showIcon = true,
  initialValue = ""
}) => {
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    // Minimal query length for intelligent search
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    // Debounce the API call
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 500);
    
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  const handleSelectSearchResult = (res) => {
    // Format the selected name cleanly
    const displayName = [res.name, res.area, res.city].filter(Boolean).join(', ');
    setSearchQuery(displayName);
    setSearchResults([]);
    
    if (onSelect) {
      onSelect(res);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div className={className} style={{ display: 'flex', alignItems: 'center', ...style }}>
        {showIcon && <SearchIcon size={18} color="var(--color-primary)" style={{ marginRight: '10px' }} />}
        
        <input 
          type="text" 
          placeholder={placeholder || "Search Location..."} 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--text-primary)', 
            width: '100%', 
            outline: 'none', 
            fontSize: '15px',
            ...customInputStyle 
          }}
        />
        
        {isSearching && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>...</span>}
      </div>
      
      {searchResults.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          right: 0, 
          zIndex: 1000, 
          maxHeight: '250px', 
          overflowY: 'auto', 
          marginTop: '8px', 
          background: 'var(--bg-main)', 
          border: '1px solid var(--border-glass)' 
        }}>
          {searchResults.map((res, i) => (
            <div 
              key={i} 
              onClick={() => handleSelectSearchResult(res)}
              style={{ padding: '12px 15px', borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '10px' }}
            >
              <MapPin size={16} color="var(--color-primary)" style={{ marginTop: '3px' }} />
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '14px' }}>
                  {res.name || 'Unknown Location'}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {[res.area, res.city].filter(Boolean).join(', ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
