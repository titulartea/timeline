import React, { useState, useEffect } from 'react';
import { TimelineEvent } from '../types';

const COLOR_OPTIONS = ['rgb(74, 111, 165)', 'rgb(190, 72, 72)', 'rgb(67, 131, 88)'];

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: TimelineEvent) => void;
  eventToEdit?: TimelineEvent | null;
  presetStartYear?: number | null;
  presetEndYear?: number | null;
  presetLaneSide?: 'above' | 'below';
}

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  eventToEdit,
  presetStartYear,
  presetEndYear,
  presetLaneSide,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Year states
  const [isBce, setIsBce] = useState(true);
  const [yearVal, setYearVal] = useState('500');

  // End Year (Time Range / Duration)
  const [hasEndYear, setHasEndYear] = useState(false);
  const [isEndBce, setIsEndBce] = useState(true);
  const [endYearVal, setEndYearVal] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title);
      setDescription(eventToEdit.description || '');
      setSelectedColor(eventToEdit.color || COLOR_OPTIONS[0]);

      // Start Year
      if (eventToEdit.year < 0) {
        setIsBce(true);
        setYearVal(Math.abs(eventToEdit.year).toString());
      } else {
        setIsBce(false);
        setYearVal(eventToEdit.year.toString());
      }

      // End Year
      if (eventToEdit.endYear !== undefined && eventToEdit.endYear !== null) {
        setHasEndYear(true);
        if (eventToEdit.endYear < 0) {
          setIsEndBce(true);
          setEndYearVal(Math.abs(eventToEdit.endYear).toString());
        } else {
          setIsEndBce(false);
          setEndYearVal(eventToEdit.endYear.toString());
        }
      } else {
        setHasEndYear(false);
        setEndYearVal('');
      }
    } else {
      // New Event (or created by click & drag on timeline)
      setTitle('');
      setDescription('');
      setSelectedColor(COLOR_OPTIONS[0]);

      const startYr = presetStartYear !== undefined && presetStartYear !== null ? presetStartYear : -500;
      if (startYr < 0) {
        setIsBce(true);
        setYearVal(Math.abs(startYr).toString());
      } else {
        setIsBce(false);
        setYearVal(startYr.toString());
      }

      if (presetEndYear !== undefined && presetEndYear !== null && presetEndYear !== startYr) {
        setHasEndYear(true);
        if (presetEndYear < 0) {
          setIsEndBce(true);
          setEndYearVal(Math.abs(presetEndYear).toString());
        } else {
          setIsEndBce(false);
          setEndYearVal(presetEndYear.toString());
        }
      } else {
        setHasEndYear(false);
        setEndYearVal('');
      }
    }
  }, [eventToEdit, presetStartYear, presetEndYear, presetLaneSide, isOpen]);

  if (!isOpen) return null;

  // Calculate numeric start year
  const rawStartNum = parseInt(yearVal, 10) || 0;
  const computedStartYear = isBce ? -Math.abs(rawStartNum) : Math.abs(rawStartNum);

  // Calculate numeric end year
  let computedEndYear: number | undefined = undefined;
  if (hasEndYear && endYearVal.trim()) {
    const rawEndNum = parseInt(endYearVal, 10) || 0;
    computedEndYear = isEndBce ? -Math.abs(rawEndNum) : Math.abs(rawEndNum);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newEvent: TimelineEvent = {
      id: eventToEdit ? eventToEdit.id : `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      description: description.trim(),
      year: computedStartYear,
      endYear: computedEndYear,
      color: selectedColor,
      updatedAt: Date.now(),
      laneSide: eventToEdit?.laneSide ?? presetLaneSide ?? 'above',
    };

    onSave(newEvent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d3436]/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-[#e1e1e1] rounded-none w-full max-w-md overflow-hidden shadow-md text-[#2d3436]">
        {/* Form Body without Header */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* 1. 사건 입력 (제목) */}
          <div>
            <label className="block text-[#2d3436] font-bold mb-1.5 text-sm">
              사건 <span className="text-red-500"></span>
            </label>
            <input
              id="event-modal-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-[#e1e1e1] rounded-none px-3 py-2 text-sm text-[#2d3436] focus:border-[#2d3436] outline-none"
              autoFocus
            />
          </div>

          {/* 2. 년도 (시작 년, 끝 년) */}
          <div className="bg-[#f8f9fa] p-3.5 border border-[#e1e1e1] space-y-3">
            <label className="block text-[#2d3436] font-bold text-sm">
              년도
            </label>

            {/* 시작 년 */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-600 block">시작 년</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-[#e1e1e1] p-0.5">
                  <button
                    type="button"
                    onClick={() => setIsBce(true)}
                    className={`px-2.5 py-1 text-xs font-bold transition-all ${
                      isBce ? 'bg-[#2d3436] text-white' : 'text-gray-500 hover:text-[#2d3436]'
                    }`}
                  >
                    BC
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBce(false)}
                    className={`px-2.5 py-1 text-xs font-bold transition-all ${
                      !isBce ? 'bg-[#2d3436] text-white' : 'text-gray-500 hover:text-[#2d3436]'
                    }`}
                  >
                    AD
                  </button>
                </div>

                <input
                  type="number"
                  value={yearVal}
                  onChange={(e) => setYearVal(e.target.value)}
                  className="flex-1 bg-none border-none rounded-none px-3 py-1.5 text-[#2d3436] font-mono text-sm focus:border-[#2d3436] outline-none"
                />
              </div>
            </div>

            {/* 끝 년 (선택/기간) */}
            <div className="space-y-1.5 pt-1 border-t border-[#e1e1e1]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasEndYear}
                  onChange={(e) => setHasEndYear(e.target.checked)}
                  className="w-3.5 h-3.5 border-[#e1e1e1] text-[#2d3436] focus:ring-0"
                />
                <span className="text-[11px] font-semibold text-gray-700">끝</span>
              </label>

              {hasEndYear && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex items-center bg-white border border-[#e1e1e1] p-0.5">
                    <button
                      type="button"
                      onClick={() => setIsEndBce(true)}
                      className={`px-2.5 py-1 text-xs font-bold transition-all ${
                        isEndBce ? 'bg-[#2d3436] text-white' : 'text-gray-500 hover:text-[#2d3436]'
                      }`}
                    >
                      BC
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEndBce(false)}
                      className={`px-2.5 py-1 text-xs font-bold transition-all ${
                        !isEndBce ? 'bg-[#2d3436] text-white' : 'text-gray-500 hover:text-[#2d3436]'
                      }`}
                    >
                      AD
                    </button>
                  </div>

                  <input
                    type="number"
                    value={endYearVal}
                    onChange={(e) => setEndYearVal(e.target.value)}
                    className="flex-1 bg-none border-none rounded-none px-3 py-1.5 text-[#2d3436] font-mono text-sm focus:border-[#2d3436] outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. 메모 */}
          <div>
            <label className="block text-[#2d3436] font-bold mb-1.5 text-sm"></label>

          <div>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  aria-label="색상 선택"
                  title="색상 선택"
                  className={`h-7 w-7 border transition-all ${selectedColor === color ? 'border-[#2d3436] scale-110' : 'border-[#e1e1e1] hover:border-[#2d3436]'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-[#e1e1e1] rounded-none px-3 py-2 text-[#2d3436] focus:border-[#2d3436] outline-none leading-relaxed text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#e1e1e1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-white border border-[#e1e1e1] hover:bg-[#f8f9fa] text-[#2d3436] font-semibold rounded-none transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 bg-[#2d3436] hover:bg-[#1e2324] text-white font-bold rounded-none shadow-xs transition-all"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
