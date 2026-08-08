import { Search, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface AdvancedSearchProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchBy: 'name' | 'all';
  onSearchByChange: (value: 'name' | 'all') => void;
}

export default function AdvancedSearch({
  searchTerm,
  onSearchChange,
  searchBy,
  onSearchByChange,
}: AdvancedSearchProps) {
  const [showFilters, setShowFilters] = useState(false);

  const searchOptions = [
    { value: 'name', label: 'Por Nome' },
    { value: 'all', label: 'Busca Geral' },
  ];

  return (
    <div className="mb-6">
      <div className="flex gap-3 items-start">
        {/* Main Search Input */}
        <div className="flex-1 relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              id="employee-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar colaborador..."
              className="w-full pl-12 pr-10 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition-all"
            />
            {!searchTerm && (
              <kbd className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-technical text-muted-foreground pointer-events-none">
                /
              </kbd>
            )}
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Button */}
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-3 bg-background border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="text-sm font-medium">
              {searchOptions.find(opt => opt.value === searchBy)?.label}
            </span>
            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {showFilters && (
            <div className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[150px]">
              {searchOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSearchByChange(option.value as 'name' | 'all');
                    setShowFilters(false);
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    searchBy === option.value ? 'bg-orange/10 text-orange font-medium' : ''
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Tips */}
      {searchTerm && (
        <div className="mt-2 text-xs text-muted-foreground">
          Pesquisando por: <span className="font-medium text-foreground">{searchTerm}</span>
        </div>
      )}
    </div>
  );
}
