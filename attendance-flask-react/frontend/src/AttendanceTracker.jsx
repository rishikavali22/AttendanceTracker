import React, { useEffect, useState } from 'react';

const API_URL = 'http://127.0.0.1:5000/api';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function AttendanceTracker() {
  const now = new Date();

  const [namesInput, setNamesInput] = useState('');
  const [roster, setRoster] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    MONTHS[now.getMonth()]
  );
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [attendanceGrid, setAttendanceGrid] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const monthNumber = MONTHS.indexOf(selectedMonth) + 1;

  const totalDays = new Date(
    selectedYear,
    monthNumber,
    0
  ).getDate();
  const [excludeSundays, setExcludeSundays] = useState(true);
  const [trackInHours, setTrackInHours] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'daily'
  const [selectedDay, setSelectedDay] = useState(Math.min(now.getDate(), 31));
  const [periodGrid, setPeriodGrid] = useState({});
  const [modalPeriods, setModalPeriods] = useState([]);

  // Get the weekday for a date, such as Mon, Tue, or Wed.
  const getWeekday = (year, month, day) => {
    return new Date(year, month - 1, day)
      .toLocaleDateString('en-US', { weekday: 'short' });
  };

  const isSunday = (day) =>
    new Date(selectedYear, monthNumber - 1, day).getDay() === 0;

  const countableDays = Array.from(
    { length: totalDays },
    (_, i) => i + 1
  ).filter(day => !excludeSundays || !isSunday(day));

  const totalCountableDays = countableDays.length;
  const totalCountableHours = totalCountableDays * hoursPerDay;

  const defaultHoursParam = trackInHours ? hoursPerDay : 1;

  const [customHoursModal, setCustomHoursModal] = useState(null);

  const getStudentPeriods = (studentId, day) => {
    if (periodGrid[studentId]?.[day] && Array.isArray(periodGrid[studentId][day])) {
      return periodGrid[studentId][day];
    }
    const currentHours = attendanceGrid[studentId]?.[day] !== undefined
      ? attendanceGrid[studentId][day]
      : (trackInHours ? hoursPerDay : 1);

    if (currentHours <= 0) return [];
    const count = Math.min(hoursPerDay, Math.round(currentHours));
    return Array.from({ length: count }, (_, i) => i + 1);
  };

  const openHoursModal = (student, day) => {
    const currentStatus = attendanceGrid[student.id]?.[day] ?? defaultHoursParam;
    const currentPeriods = getStudentPeriods(student.id, day);
    setCustomHoursModal({ student, day, currentHours: currentStatus });
    setModalPeriods(currentPeriods);
  };

  const savePeriodModal = async () => {
    if (!customHoursModal) return;
    const { student, day } = customHoursModal;
    const nextHours = modalPeriods.length;
    const attendanceDate =
      `${selectedYear}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setAttendanceGrid(previous => ({
      ...previous,
      [student.id]: {
        ...(previous[student.id] || {}),
        [day]: nextHours
      }
    }));

    setPeriodGrid(previous => ({
      ...previous,
      [student.id]: {
        ...(previous[student.id] || {}),
        [day]: modalPeriods
      }
    }));

    setCustomHoursModal(null);

    try {
      const response = await fetch(`${API_URL}/attendance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id: student.id,
          attendance_date: attendanceDate,
          status: nextHours,
          periods: modalPeriods
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not save period attendance');
      }
    } catch (error) {
      setMessage(error.message);
      await loadAttendance();
    }
  };

  const togglePeriod = async (student, day, periodNum) => {
    if (excludeSundays && isSunday(day)) return;

    const currentPeriods = getStudentPeriods(student.id, day);
    const hasPeriod = currentPeriods.includes(periodNum);
    const nextPeriods = hasPeriod
      ? currentPeriods.filter(p => p !== periodNum)
      : [...currentPeriods, periodNum].sort((a, b) => a - b);

    const nextHours = nextPeriods.length;
    const attendanceDate =
      `${selectedYear}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setPeriodGrid(prev => ({
      ...prev,
      [student.id]: {
        ...(prev[student.id] || {}),
        [day]: nextPeriods
      }
    }));

    setAttendanceGrid(prev => ({
      ...prev,
      [student.id]: {
        ...(prev[student.id] || {}),
        [day]: nextHours
      }
    }));

    try {
      const response = await fetch(`${API_URL}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.id,
          attendance_date: attendanceDate,
          status: nextHours,
          periods: nextPeriods
        })
      });
      if (!response.ok) {
        throw new Error('Could not save period attendance');
      }
    } catch (error) {
      setMessage(error.message);
      await loadAttendance();
    }
  };

  const markPeriodForClass = async (periodNum, present) => {
    if (excludeSundays && isSunday(selectedDay)) return;

    const attendanceDate =
      `${selectedYear}-${String(monthNumber).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

    const bulkItems = [];
    const newPeriodGrid = { ...periodGrid };
    const newAttendanceGrid = { ...attendanceGrid };

    roster.forEach(student => {
      const current = getStudentPeriods(student.id, selectedDay);
      const updated = present
        ? (current.includes(periodNum) ? current : [...current, periodNum].sort((a, b) => a - b))
        : current.filter(p => p !== periodNum);

      newPeriodGrid[student.id] = { ...(newPeriodGrid[student.id] || {}), [selectedDay]: updated };
      newAttendanceGrid[student.id] = { ...(newAttendanceGrid[student.id] || {}), [selectedDay]: updated.length };

      bulkItems.push({
        student_id: student.id,
        attendance_date: attendanceDate,
        status: updated.length,
        periods: updated
      });
    });

    setPeriodGrid(newPeriodGrid);
    setAttendanceGrid(newAttendanceGrid);

    try {
      await fetch(`${API_URL}/attendance/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkItems)
      });
    } catch (error) {
      setMessage(error.message);
      await loadAttendance();
    }
  };

  const markEntireDayForClass = async (present) => {
    if (excludeSundays && isSunday(selectedDay)) return;

    const attendanceDate =
      `${selectedYear}-${String(monthNumber).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

    const targetPeriods = present ? Array.from({ length: hoursPerDay }, (_, i) => i + 1) : [];
    const bulkItems = [];
    const newPeriodGrid = { ...periodGrid };
    const newAttendanceGrid = { ...attendanceGrid };

    roster.forEach(student => {
      newPeriodGrid[student.id] = { ...(newPeriodGrid[student.id] || {}), [selectedDay]: targetPeriods };
      newAttendanceGrid[student.id] = { ...(newAttendanceGrid[student.id] || {}), [selectedDay]: targetPeriods.length };

      bulkItems.push({
        student_id: student.id,
        attendance_date: attendanceDate,
        status: targetPeriods.length,
        periods: targetPeriods
      });
    });

    setPeriodGrid(newPeriodGrid);
    setAttendanceGrid(newAttendanceGrid);

    try {
      await fetch(`${API_URL}/attendance/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkItems)
      });
    } catch (error) {
      setMessage(error.message);
      await loadAttendance();
    }
  };

  // Load students and attendance from the Python backend.
  const loadAttendance = async () => {
    try {
      const response = await fetch(
        `${API_URL}/attendance?month=${monthNumber}&year=${selectedYear}&default_hours=${defaultHoursParam}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not load attendance');
      }

      setRoster(
        data.students.map(student => ({
          id: student.id,
          name: student.name
        }))
      );

      const grid = {};
      const pGrid = {};

      data.students.forEach(student => {
        grid[student.id] = {};
        pGrid[student.id] = {};

        Object.entries(student.attendance).forEach(([day, status]) => {
          grid[student.id][day] = Number(status);
        });

        if (student.periods) {
          Object.entries(student.periods).forEach(([day, periods]) => {
            pGrid[student.id][day] = Array.isArray(periods) ? periods : [];
          });
        }
      });

      setAttendanceGrid(grid);
      setPeriodGrid(pGrid);
      setMessage('');
    } catch (error) {
      setMessage(
        `${error.message}. Make sure the Python backend is running on port 5000.`
      );
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedMonth, selectedYear, trackInHours, hoursPerDay]);

  // Add students to the backend.
  const handleSetupRoster = async (event) => {
    event.preventDefault();

    const parsedNames = namesInput
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(Boolean);

    if (parsedNames.length === 0) {
      setMessage('Enter one or more student names, separated by commas.');
      return;
    }

    setLoading(true);

    try {
      for (const name of parsedNames) {
        const response = await fetch(`${API_URL}/students`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok && response.status !== 409) {
          throw new Error(data.error || `Could not add ${name}`);
        }
      }

      setNamesInput('');
      await loadAttendance();
      setMessage('Student roster saved to the Python backend.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle attendance between Full and Absent (0).
  const toggleAttendance = async (student, day) => {
    if (excludeSundays && isSunday(day)) {
      return;
    }

    const maxHours = trackInHours ? hoursPerDay : 1;
    const currentStatus = attendanceGrid[student.id]?.[day] ?? maxHours;
    const nextStatus = currentStatus > 0 ? 0 : maxHours;

    const attendanceDate =
      `${selectedYear}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setAttendanceGrid(previous => ({
      ...previous,
      [student.id]: {
        ...previous[student.id],
        [day]: nextStatus
      }
    }));

    try {
      const response = await fetch(`${API_URL}/attendance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id: student.id,
          attendance_date: attendanceDate,
          status: nextStatus
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not save attendance');
      }
    } catch (error) {
      setMessage(error.message);
      await loadAttendance();
    }
  };

  // Delete a student and their attendance records.
  const deleteStudent = async (student) => {
    if (
      !window.confirm(
        `Delete ${student.name} and all their attendance records?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/students/${student.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not delete student');
      }

      await loadAttendance();
      setMessage(`${student.name} deleted.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="dashboard">
      <h1>AttendTrack</h1>

      <p className="intro">
        Track Attendance. Measure Progress.
      </p>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}

      <form onSubmit={handleSetupRoster} className="control-panel">
        <div className="field roster-field">
          <label htmlFor="names">
            Student names (separate with commas)
          </label>

          <input
            id="names"
            type="text"
            value={namesInput}
            onChange={event => setNamesInput(event.target.value)}
            placeholder="Alice, Bob, Charlie"
          />
        </div>

        <div className="field">
          <label htmlFor="month">Target month</label>

          <select
            id="month"
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
          >
            {MONTHS.map(month => (
              <option key={month} value={month}>
                {month[0].toUpperCase() + month.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="field year-field">
          <label htmlFor="year">Year</label>

          <input
            id="year"
            type="number"
            min="2000"
            max="2100"
            value={selectedYear}
            onChange={event =>
              setSelectedYear(
                Number(event.target.value) || now.getFullYear()
              )
            }
          />
        </div>
        <div className="field sunday-option">
          <label>
            <input
              type="checkbox"
              checked={excludeSundays}
              onChange={event => setExcludeSundays(event.target.checked)}
            />
            Exclude Sundays from attendance
          </label>
        </div>

        <div className="field hours-option">
          <label>
            <input
              type="checkbox"
              checked={trackInHours}
              onChange={event => setTrackInHours(event.target.checked)}
            />
            Track in hours
          </label>
        </div>

        {trackInHours && (
          <div className="field hours-select-field">
            <label htmlFor="hours-per-day">Hours / day</label>
            <select
              id="hours-per-day"
              value={hoursPerDay}
              onChange={event => setHoursPerDay(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(hr => (
                <option key={hr} value={hr}>
                  {hr} {hr === 1 ? 'hr' : 'hrs'}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Saving…' : 'Generate Matrix'}
        </button>
      </form>

      <div className="view-mode-tabs">
        <button
          type="button"
          className={`view-tab ${viewMode === 'monthly' ? 'active' : ''}`}
          onClick={() => setViewMode('monthly')}
        >
          📅 Monthly Calendar View
        </button>
        <button
          type="button"
          className={`view-tab ${viewMode === 'daily' ? 'active' : ''}`}
          onClick={() => {
            setViewMode('daily');
            setTrackInHours(true);
          }}
        >
          ⏰ Daily Period Register (Hour-by-Hour)
        </button>
      </div>

      {viewMode === 'monthly' ? (
        <>
          <div className="summary-row">
            <div className="summary-card">
              <span>Total students</span>
              <strong>{roster.length}</strong>
            </div>

            <div className="summary-card">
              <span>Month</span>
              <strong>
                {selectedMonth[0].toUpperCase() + selectedMonth.slice(1)}
              </strong>
            </div>

            <div className="summary-card">
              <span>{trackInHours ? 'Total hours' : 'Days'}</span>
              <strong>
                {trackInHours
                  ? `${totalCountableHours} hrs`
                  : totalCountableDays}
              </strong>
              {trackInHours && (
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  {totalCountableDays} days × {hoursPerDay} hrs/day
                </small>
              )}
            </div>
          </div>

          {trackInHours && (
            <div className="hint-banner">
              💡 <strong>Hours Mode:</strong> Click any day to toggle Full ({hoursPerDay}h) / Absent (0h). <strong>Double-click or right-click</strong> any day to set period-by-period hours (e.g. 4 hours on a {hoursPerDay}-hour day).
            </div>
          )}

          {roster.length > 0 ? (
            <div className="grid-container">
              <table>
                <thead>
                  <tr>
                    <th className="name-heading">Name</th>

                    {Array.from(
                      { length: totalDays },
                      (_, index) => index + 1
                    ).map(day => {
                      const sunday = isSunday(day);
                      return (
                        <th
                          className={`day-heading ${sunday ? 'sunday-heading' : ''}`}
                          key={day}
                        >
                          <div>{getWeekday(selectedYear, monthNumber, day)}</div>
                          <div>{day}</div>
                          {sunday && excludeSundays && <small>Excluded</small>}
                        </th>
                      );
                    })}

                    <th>{trackInHours ? 'Hours Attended' : 'Attended'}</th>
                    <th>Rate</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {roster.map(student => {
                    const studentGrid = attendanceGrid[student.id] || {};

                    let studentTotalHours = 0;
                    let studentPresentDays = 0;

                    for (const day of countableDays) {
                      const status = studentGrid[day] !== undefined ? studentGrid[day] : defaultHoursParam;
                      if (status > 0) {
                        studentPresentDays++;
                        studentTotalHours += Number(status);
                      }
                    }

                    const totalAttended = trackInHours ? studentTotalHours : studentPresentDays;
                    const totalPossible = trackInHours ? totalCountableHours : totalCountableDays;

                    const percentage = totalPossible
                      ? ((totalAttended / totalPossible) * 100).toFixed(1)
                      : '0.0';

                    return (
                      <tr key={student.id}>
                        <td className="student-name">
                          {student.name}
                        </td>

                        {Array.from(
                          { length: totalDays },
                          (_, index) => index + 1
                        ).map(day => {
                          const sunday = isSunday(day);
                          const isSundayExcluded = sunday && excludeSundays;
                          const dayStatus = studentGrid[day] !== undefined ? studentGrid[day] : defaultHoursParam;
                          const maxHours = trackInHours ? hoursPerDay : 1;

                          const isPartial = dayStatus > 0 && dayStatus < maxHours;
                          const isAbsent = dayStatus === 0;

                          let statusClass = 'present';
                          if (isSundayExcluded) statusClass = 'absent excluded';
                          else if (isPartial) statusClass = 'partial';
                          else if (isAbsent) statusClass = 'absent';

                          const displayValue = isSundayExcluded ? 0 : dayStatus;

                          return (
                            <td
                              key={day}
                              className={`cell ${sunday ? 'sunday-cell' : ''}`}
                            >
                              <button
                                type="button"
                                disabled={isSundayExcluded}
                                onClick={() => toggleAttendance(student, day)}
                                onDoubleClick={() => !isSundayExcluded && openHoursModal(student, day)}
                                onContextMenu={(e) => {
                                  if (!isSundayExcluded) {
                                    e.preventDefault();
                                    openHoursModal(student, day);
                                  }
                                }}
                                className={`attendance-button ${statusClass}`}
                                aria-label={`${student.name}, ${getWeekday(
                                  selectedYear,
                                  monthNumber,
                                  day
                                )} ${day}: ${displayValue} hrs`}
                                title={`${getWeekday(
                                  selectedYear,
                                  monthNumber,
                                  day
                                )} ${day}: ${displayValue} hrs${isSundayExcluded
                                  ? ' (Sunday Excluded)'
                                  : ' (Click to toggle, double-click or right-click to edit periods)'
                                  }`}
                              >
                                {displayValue}
                              </button>
                            </td>
                          );
                        })}

                        <td className="attended">
                          {trackInHours
                            ? `${studentTotalHours} / ${totalCountableHours} hrs`
                            : `${studentPresentDays} / ${totalCountableDays}`}
                        </td>

                        <td>
                          <span
                            className={`percentage ${Number(percentage) < 75 ? 'low' : 'good'
                              }`}
                          >
                            {percentage}%
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => deleteStudent(student)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              Enter student names above and click Generate Matrix.
            </div>
          )}

          <p className="note">
            {trackInHours
              ? `Green = Full (${hoursPerDay} hrs) · Yellow = Partial (< ${hoursPerDay} hrs) · Red = Absent (0 hrs) · Sundays Excluded = 0 hrs.`
              : 'Green = Present (1) · Red = Absent (0). Attendance is saved by the Python backend.'}
          </p>
        </>
      ) : (
        <div className="daily-register-panel">
          <div className="daily-control-bar">
            <div className="field">
              <label htmlFor="daily-day-select">Select Date / Day</label>
              <select
                id="daily-day-select"
                value={selectedDay}
                onChange={e => setSelectedDay(Number(e.target.value))}
              >
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>
                    {selectedMonth[0].toUpperCase() + selectedMonth.slice(1)} {day}, {selectedYear} ({getWeekday(selectedYear, monthNumber, day)})
                    {isSunday(day) && excludeSundays ? ' — [Sunday Excluded]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="daily-periods-count">Periods / Hours per day</label>
              <select
                id="daily-periods-count"
                value={hoursPerDay}
                onChange={e => setHoursPerDay(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(num => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'Period' : 'Periods'} / day
                  </option>
                ))}
              </select>
            </div>

            <div className="daily-actions">
              <button
                type="button"
                className="action-outline-btn"
                title="Jump to today's date"
                onClick={() => setSelectedDay(Math.min(now.getDate(), totalDays))}
              >
                📅 Today (Day {Math.min(now.getDate(), totalDays)})
              </button>
              <button
                type="button"
                className="action-outline-btn"
                title="Jump to the last day of the month for overall percentage"
                onClick={() => setSelectedDay(totalDays)}
              >
                🏁 Month End (Day {totalDays})
              </button>
              <button
                type="button"
                className="action-outline-btn"
                disabled={excludeSundays && isSunday(selectedDay)}
                onClick={() => markEntireDayForClass(true)}
              >
                ✓ Mark All Present Today
              </button>
              <button
                type="button"
                className="action-outline-btn"
                disabled={excludeSundays && isSunday(selectedDay)}
                onClick={() => markEntireDayForClass(false)}
              >
                ✗ Mark All Absent Today
              </button>
            </div>
          </div>

          {excludeSundays && isSunday(selectedDay) && (
            <div className="message" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
              ⚠️ <strong>Sunday Excluded:</strong> Attendance on Sundays is excluded from total calculations.
            </div>
          )}

          {roster.length > 0 ? (
            <div className="grid-container">
              <table>
                <thead>
                  <tr>
                    <th className="name-heading">Student Name</th>
                    {Array.from({ length: hoursPerDay }, (_, i) => i + 1).map(p => (
                      <th key={p} className="day-heading" style={{ minWidth: '78px' }}>
                        <div>Period {p}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Hr {p}</div>
                        <button
                          type="button"
                          className="period-header-btn"
                          title={`Mark all students present for Period ${p}`}
                          disabled={excludeSundays && isSunday(selectedDay)}
                          onClick={() => markPeriodForClass(p, true)}
                        >
                          All ✓
                        </button>
                      </th>
                    ))}
                    <th>Today's Hours</th>
                    <th>Today %</th>
                    <th style={{ minWidth: '140px' }}>
                      <div>Monthly % (To Date)</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
                        Up to Day {selectedDay} ({countableDays.filter(d => d <= selectedDay).length} Days)
                      </div>
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(student => {
                    const studentGrid = attendanceGrid[student.id] || {};
                    const attendedPeriods = getStudentPeriods(student.id, selectedDay);
                    const count = (excludeSundays && isSunday(selectedDay)) ? 0 : attendedPeriods.length;
                    const rate = ((count / hoursPerDay) * 100).toFixed(1);

                    const countableDaysUpToDate = countableDays.filter(day => day <= selectedDay);

                    let studentUpToDateHours = 0;
                    let studentUpToDateDays = 0;

                    for (const day of countableDaysUpToDate) {
                      const status = studentGrid[day] !== undefined ? studentGrid[day] : defaultHoursParam;
                      if (status > 0) {
                        studentUpToDateDays++;
                        studentUpToDateHours += Number(status);
                      }
                    }

                    const possibleUpToDate = trackInHours
                      ? countableDaysUpToDate.length * hoursPerDay
                      : countableDaysUpToDate.length;
                    const attendedUpToDate = trackInHours
                      ? studentUpToDateHours
                      : studentUpToDateDays;
                    const upToDatePercentage = possibleUpToDate > 0
                      ? ((attendedUpToDate / possibleUpToDate) * 100).toFixed(1)
                      : '0.0';

                    let badge = 'absent';
                    let badgeText = 'Absent';
                    if (count === hoursPerDay) {
                      badge = 'full';
                      badgeText = 'Full Day';
                    } else if (count > 0) {
                      badge = 'partial';
                      badgeText = 'Partial';
                    }

                    return (
                      <tr key={student.id}>
                        <td className="student-name">{student.name}</td>
                        {Array.from({ length: hoursPerDay }, (_, i) => i + 1).map(p => {
                          const isAttended = !(excludeSundays && isSunday(selectedDay)) && attendedPeriods.includes(p);
                          return (
                            <td key={p} className={`cell ${isSunday(selectedDay) ? 'sunday-cell' : ''}`}>
                              <button
                                type="button"
                                disabled={excludeSundays && isSunday(selectedDay)}
                                onClick={() => togglePeriod(student, selectedDay, p)}
                                className={`attendance-button ${isAttended ? 'present' : 'absent'} ${(excludeSundays && isSunday(selectedDay)) ? 'excluded' : ''
                                  }`}
                                title={`${student.name}: Period ${p} (${isAttended ? 'Present' : 'Absent'})`}
                              >
                                {isAttended ? '1' : '0'}
                              </button>
                            </td>
                          );
                        })}
                        <td className="attended">{count} / {hoursPerDay} hrs</td>
                        <td>
                          <span className={`percentage ${Number(rate) < 75 ? 'low' : 'good'}`}>
                            {rate}%
                          </span>
                        </td>
                        <td>
                          <div
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                            title={`Up to Day ${selectedDay}: ${attendedUpToDate} of ${possibleUpToDate} ${trackInHours ? 'hours' : 'days'} attended`}
                          >
                            <span
                              className={`percentage ${Number(upToDatePercentage) < 75 ? 'low' : 'good'}`}
                              style={{ fontSize: '14px', fontWeight: 700 }}
                            >
                              {upToDatePercentage}%
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {trackInHours
                                ? `${attendedUpToDate}h attended / ${possibleUpToDate}h total`
                                : `${attendedUpToDate}d attended / ${possibleUpToDate}d total`}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${badge}`}>
                            {badgeText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              No students enrolled yet. Add students above to take period attendance.
            </div>
          )}
        </div>
      )}

      {customHoursModal && (
        <div className="modal-overlay" onClick={() => setCustomHoursModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Period-by-Period Attendance</h3>
              <p>
                <strong>{customHoursModal.student.name}</strong> ·{' '}
                {getWeekday(selectedYear, monthNumber, customHoursModal.day)},{' '}
                {selectedMonth[0].toUpperCase() + selectedMonth.slice(1)} {customHoursModal.day}, {selectedYear}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                Attended: {modalPeriods.length} / {hoursPerDay} Periods ({modalPeriods.length} hrs)
              </span>
              <span className={`status-badge ${modalPeriods.length === hoursPerDay ? 'full' : (modalPeriods.length > 0 ? 'partial' : 'absent')
                }`}>
                {modalPeriods.length === hoursPerDay ? 'Full Day' : (modalPeriods.length > 0 ? 'Partial' : 'Absent')}
              </span>
            </div>

            <div className="period-pill-grid">
              {Array.from({ length: hoursPerDay }, (_, i) => i + 1).map(periodNum => {
                const isAttended = modalPeriods.includes(periodNum);
                return (
                  <button
                    key={periodNum}
                    type="button"
                    className={`period-pill ${isAttended ? 'present' : 'absent'}`}
                    onClick={() => {
                      setModalPeriods(prev =>
                        prev.includes(periodNum)
                          ? prev.filter(p => p !== periodNum)
                          : [...prev, periodNum].sort((a, b) => a - b)
                      );
                    }}
                  >
                    <span>Period {periodNum}</span>
                    <strong>{isAttended ? '✓' : '✗'}</strong>
                  </button>
                );
              })}
            </div>

            <div className="modal-quick-presets">
              <span style={{ width: '100%', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Quick shortcuts:
              </span>
              <button
                type="button"
                className="preset-chip"
                onClick={() => setModalPeriods(Array.from({ length: hoursPerDay }, (_, i) => i + 1))}
              >
                All Present ({hoursPerDay}h)
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => setModalPeriods([])}
              >
                All Absent (0h)
              </button>
              {hoursPerDay >= 4 && (
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setModalPeriods(Array.from({ length: 4 }, (_, i) => i + 1))}
                >
                  First 4 Periods
                </button>
              )}
              {hoursPerDay > 4 && (
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setModalPeriods(Array.from({ length: Math.round(hoursPerDay / 2) }, (_, i) => i + 1))}
                >
                  Half Day ({Math.round(hoursPerDay / 2)}h)
                </button>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCustomHoursModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => savePeriodModal()}
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendanceTracker;