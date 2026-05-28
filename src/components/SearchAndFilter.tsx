import React, { useState } from 'react';
import { Search, RotateCcw, SlidersHorizontal, Check } from 'lucide-react';
import { CategoryItem } from '../types';

interface SearchAndFilterProps {
  categories: CategoryItem[];
  selectedCategoryId: string | number;
  onSelectCategory: (id: string | number) => void;
  onSearch: (keyword: string) => void;
  currentSearch: string;
}

export default function SearchAndFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onSearch,
  currentSearch
}: SearchAndFilterProps) {
  const [inputValue, setInputValue] = useState(currentSearch);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(inputValue.trim());
  };

  const handleClear = () => {
    setInputValue('');
    onSearch('');
  };

  return (
    <div className="w-full bg-[#141414] rounded-xl shadow-lg border border-zinc-900 p-4 space-y-4" id="filter-panel">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="flex gap-2.5">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center justify-center text-zinc-500">
            <Search className="h-4.5 w-4.5" />
          </span>
          <input
            id="search-input-field"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="搜索全网电影、电视剧、综艺、动漫..."
            className="w-full py-2.5 pl-10 pr-4 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-hidden focus:border-red-600 focus:ring-2 focus:ring-red-600/30 transition-all"
          />
          {inputValue && (
            <button
              id="clear-search-btn"
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-3 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          id="search-submit-btn"
          type="submit"
          className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-sm hover:shadow-md transition duration-150 shrink-0 flex items-center space-x-1 active:scale-95 cursor-pointer"
        >
          <span>搜索</span>
        </button>
      </form>

      {/* Category filters */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-zinc-500">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">影片分类</span>
        </div>
        
        {/* Horizontal scrollable tags container */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <button
            id="cat-badge-all"
            onClick={() => onSelectCategory('')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              selectedCategoryId === ''
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-zinc-900 text-zinc-350 hover:bg-zinc-850 hover:text-white'
            }`}
          >
            全部类型
          </button>
          
          {categories.map((cat) => {
            const isSelected = String(selectedCategoryId) === String(cat.id);
            return (
              <button
                id={`cat-badge-${cat.id}`}
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center space-x-1 ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-350 hover:bg-zinc-850 hover:text-white'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
                <span>{cat.name}</span>
              </button>
            );
          })}

          {categories.length === 0 && (
            <span className="text-zinc-500 text-xs py-1" id="cat-no-sources">
              (选择不同的CMS资源站后，将在此自动拉取其分类目录)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
