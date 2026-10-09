"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type StockItem } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RiSearchLine,
  RiCloseLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from "@remixicon/react";
import { CATEGORY_LABEL } from "@/lib/api";

interface StockSearchProps {
  onSearch?: (query: string) => void;
  onSelectItem?: (item: StockItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function StockSearch({
  onSearch,
  onSelectItem,
  placeholder = "Buscar por SKU (exato) ou nome...",
  autoFocus = false,
}: StockSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StockItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        // Busca exata por code primeiro, depois ILIKE por name
        const trimmed = query.trim();
        const items = await api<StockItem[]>(
          `/api/stock-items?search=${encodeURIComponent(trimmed)}`
        );
        setSuggestions(items);
      } catch (error) {
        console.error("Erro na busca:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: StockItem) => {
    setQuery(item.code || item.name);
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    onSelectItem?.(item);
    // Navigate to estoque with category filter
    const catParam =
      item.category === "PAPER_MEDIA"
        ? "bobinas"
        : item.category === "INK_SUPPLY"
        ? "tintas"
        : "TODOS";
    router.push(`/estoque?cat=${catParam}`);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || suggestions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && suggestions[selectedIndex]) {
            handleSelect(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [isOpen, suggestions, selectedIndex, handleSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(true);
    setSelectedIndex(-1);
    onSearch?.(value);
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    onSearch?.("");
  };

  const getStatusBadge = (status: StockItem["status"]) => {
    switch (status) {
      case "AVAILABLE":
        return <Badge className="bg-emerald-500 text-white text-[10px]">Disponível</Badge>;
      case "LOW_STOCK":
        return <Badge className="bg-amber-500 text-white text-[10px]">Baixo</Badge>;
      default:
        return <Badge className="bg-red-500 text-white text-[10px]">Zerado</Badge>;
    }
  };

  const getCategoryBadge = (category: StockItem["category"]) => {
    const colors = {
      PAPER_MEDIA: "border-sky-200 bg-sky-50 text-sky-800",
      INK_SUPPLY: "border-purple-200 bg-purple-50 text-purple-800",
      OTHER: "border-gray-200 bg-gray-50 text-gray-800",
    };
    return (
      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${colors[category]}`}>
        {CATEGORY_LABEL[category] ?? category}
      </span>
    );
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="pl-10 pr-10 h-11 rounded-xl bg-white border-gray-200 shadow-sm"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={handleClear}
            aria-label="Limpar busca"
          >
            <RiCloseLine className="size-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-2 w-full max-h-96 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {isLoading && (
            <div className="px-4 py-3 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          )}
          {!isLoading && suggestions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                index === selectedIndex
                  ? "bg-sky-50 text-sky-900"
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 truncate">{item.name}</span>
                  {item.code && (
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-700 font-medium">
                      {item.code}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getCategoryBadge(item.category)}
                  {getStatusBadge(item.status)}
                  {item.individualItems && item.individualItems.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {item.individualItems.filter(i => i.state === 'IN_USE').length} em uso ·{' '}
                      {item.individualItems.filter(i => i.state === 'NEW').length} disponíveis
                    </span>
                  )}
                </div>
              </div>
              {index === selectedIndex && (
                <RiArrowDownSLine className="size-5 text-sky-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {!isOpen && query.length >= 2 && suggestions.length === 0 && !isLoading && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="px-4 py-3 text-center text-sm text-muted-foreground">
            Nenhum item encontrado para &ldquo;{query}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}