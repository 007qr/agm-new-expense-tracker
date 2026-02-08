import Calendar from '@corvu/calendar';
import Popover from '@corvu/popover';
import { createEffect, createSignal, Index, Show } from 'solid-js';

type DateRangePickerProps = {
  value: { from: Date; to: Date } | null;
  onRangeChange: (range: { from: Date; to: Date } | null) => void;
};

type RangeValue = { from: Date | null; to: Date | null };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DateRangePicker = (props: DateRangePickerProps) => {
  const [internalValue, setInternalValue] = createSignal<RangeValue>({ from: null, to: null });

  createEffect(() => {
    const v = props.value;
    if (v) {
      setInternalValue({ from: v.from, to: v.to });
    } else {
      setInternalValue({ from: null, to: null });
    }
  });

  return (
    <Calendar
      mode="range"
      value={internalValue()}
      onValueChange={(value) => {
        setInternalValue(value);
        if (value && value.from && value.to) {
          props.onRangeChange({ from: value.from, to: value.to });
        }
      }}
      numberOfMonths={2}
      initialMonth={new Date()}
      initialFocusedDay={new Date()}
    >
      {(calendarProps) => {
        const currentYear = () => calendarProps.month.getFullYear();
        const currentMonth = () => calendarProps.month.getMonth();

        const years = () => {
          const list = [];
          for (let y = 2020; y <= new Date().getFullYear() + 1; y++) {
            list.push(y);
          }
          return list;
        };

        return (
          <Popover
            placement="bottom-start"
            floatingOptions={{
              offset: 5,
              flip: true,
              shift: true,
            }}
          >
            <Popover.Trigger class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              <Show
                when={calendarProps.value && calendarProps.value.from && calendarProps.value.to}
                fallback="Select Date Range"
              >
                {calendarProps.value.from?.toLocaleDateString()} - {calendarProps.value.to?.toLocaleDateString()}
              </Show>
            </Popover.Trigger>

            <Popover.Content class="z-50 rounded-lg bg-white shadow-xl p-4 data-open:animate-in data-open:fade-in-50% data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-50% data-closed:slide-out-to-top-1">
              {/* Month/Year navigation header */}
              <div class="flex items-center justify-between mb-3 gap-4">
                <Calendar.Nav
                  action="prev-year"
                  class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800"
                  aria-label="Previous year"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </Calendar.Nav>
                <Calendar.Nav
                  action="prev-month"
                  class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800"
                  aria-label="Previous month"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </Calendar.Nav>

                <div class="flex items-center gap-2">
                  <select
                    class="text-sm font-semibold bg-transparent border border-zinc-200 rounded px-2 py-1 cursor-pointer hover:border-zinc-400 focus:outline-none focus:border-blue-500"
                    value={currentMonth()}
                    onChange={(e) => {
                      const newMonth = parseInt(e.currentTarget.value);
                      calendarProps.navigate((date) => new Date(date.getFullYear(), newMonth, 1));
                    }}
                  >
                    <Index each={MONTHS}>
                      {(m, i) => <option value={i}>{m()}</option>}
                    </Index>
                  </select>
                  <select
                    class="text-sm font-semibold bg-transparent border border-zinc-200 rounded px-2 py-1 cursor-pointer hover:border-zinc-400 focus:outline-none focus:border-blue-500"
                    value={currentYear()}
                    onChange={(e) => {
                      const newYear = parseInt(e.currentTarget.value);
                      calendarProps.navigate((date) => new Date(newYear, date.getMonth(), 1));
                    }}
                  >
                    <Index each={years()}>
                      {(y) => <option value={y()}>{y()}</option>}
                    </Index>
                  </select>
                </div>

                <Calendar.Nav
                  action="next-month"
                  class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800"
                  aria-label="Next month"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Calendar.Nav>
                <Calendar.Nav
                  action="next-year"
                  class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800"
                  aria-label="Next year"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7m-8-14l7 7-7 7" />
                  </svg>
                </Calendar.Nav>
              </div>

              {/* Calendar grids */}
              <div class="flex gap-4">
                <Index each={calendarProps.months}>
                  {(month, index) => (
                    <div class="flex flex-col">
                      <Calendar.Label index={index} class="font-semibold mb-2 text-center text-sm text-zinc-700">
                        {month().month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                      </Calendar.Label>

                      <Calendar.Table index={index} class="mt-1">
                        <thead>
                          <tr>
                            <Index each={calendarProps.weekdays}>
                              {(day) => (
                                <Calendar.HeadCell class="text-center text-sm font-medium p-2 w-10">
                                  {day().toLocaleDateString('en', { weekday: 'short' })}
                                </Calendar.HeadCell>
                              )}
                            </Index>
                          </tr>
                        </thead>
                        <tbody>
                          <Index each={month().weeks}>
                            {(week) => (
                              <tr>
                                <Index each={week()}>
                                  {(day) => (
                                    <Calendar.Cell class="p-0">
                                      <Calendar.CellTrigger
                                        day={day()}
                                        month={month().month}
                                        class="w-10 h-10 text-center rounded hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed data-[selected]:bg-blue-500 data-[selected]:text-white data-[range-start]:bg-blue-500 data-[range-end]:bg-blue-500 data-[in-range]:bg-blue-200 data-[today]:border data-[today]:border-blue-500"
                                      >
                                        {day().getDate()}
                                      </Calendar.CellTrigger>
                                    </Calendar.Cell>
                                  )}
                                </Index>
                              </tr>
                            )}
                          </Index>
                        </tbody>
                      </Calendar.Table>
                    </div>
                  )}
                </Index>
              </div>
            </Popover.Content>
          </Popover>
        );
      }}
    </Calendar>
  );
};

export default DateRangePicker;
