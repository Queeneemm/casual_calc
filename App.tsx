import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Switch } from './components/ui/switch';
import { Trash2, Plus, Settings, Save, Upload, Database, Copy, Check, Calendar, BarChart3, History, Download, Moon, Sun, UserCheck } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface SalaryFormula {
  shiftRate: number;
  internshipRate: number; // Ставка за стажировку
  totalBarAmount: number; // Общая сумма бара (a)
  barPercentage: number; // Процент с бара (b), например 0.07 для 7%
}

interface Employee {
  id: string;
  name: string;
  shifts: number;
  internshipShifts: number; // Количество стажёрских смен
  corkageFee: number;
  penalties: number;
  barDebt: number;
}

interface CalculatedSalary {
  employee: Employee;
  breakdown: {
    fromShifts: number;
    fromInternshipShifts: number;
    fromBar: number;
    fromCorkageFee: number;
    fromPenalties: number;
    fromBarDebt: number;
  };
  total: number;
  isIntern: boolean;
  regularShifts: number;
}

interface PayrollPeriod {
  startDate: string;
  endDate: string;
}

interface PayrollHistory {
  id: string;
  period_start: string;
  period_end: string;
  employee_id: string;
  employee_name: string;
  shifts: number;
  internship_shifts: number;
  corkage_fee: number;
  penalties: number;
  bar_debt: number;
  total_salary: number;
  total_bar_amount: number;
  bar_percentage: number;
  created_at: string;
}

interface EmployeeStats {
  employee_name: string;
  total_shifts: number;
  total_internship_shifts: number;
  total_corkage_fee: number;
  total_penalties: number;
  total_bar_debt: number;
  total_salary: number;
  periods_count: number;
}

interface SavedPeriod {
  id: string;
  period_start: string;
  period_end: string;
  total_employees: number;
  total_payroll: number;
  total_bar_amount: number;
  bar_percentage: number;
  created_at: string;
}

// Глобальный клиент Supabase для избежания множественных экземпляров
let supabaseClient: any = null;

// Функция для безопасного форматирования чисел
const safeToLocaleString = (value: number | undefined | null, locale: string = 'ru-RU') => {
  return (value || 0).toLocaleString(locale);
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [formula, setFormula] = useState<SalaryFormula>({
    shiftRate: 1000,
    internshipRate: 1000,
    totalBarAmount: 100000,
    barPercentage: 0.07, // 7% по умолчанию
  });

  const [employees, setEmployees] = useState<Employee[]>([
    {
      id: '1',
      name: 'Иван Петров',
      shifts: 20,
      internshipShifts: 0,
      corkageFee: 2000,
      penalties: 500,
      barDebt: 300,
    },
    {
      id: '2',
      name: 'Мария Сидорова',
      shifts: 18,
      internshipShifts: 4,
      corkageFee: 2500,
      penalties: 0,
      barDebt: 0,
    },
  ]);

  // Состояние для периода расчёта
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(() => {
    try {
      const currentDate = new Date();
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      return {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0]
      };
    } catch {
      return {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };
    }
  });

  const [loading, setLoading] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [tablesCreated, setTablesCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [savedPeriods, setSavedPeriods] = useState<SavedPeriod[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState({
    url: '',
    key: ''
  });

  // Применение темной темы
  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    } catch (error) {
      console.log('Ошибка применения темы');
    }
  }, [isDarkMode]);

  useEffect(() => {
    loadLocalData();
    // Попытка загрузить сохранённую конфигурацию Supabase
    try {
      const savedConfig = localStorage.getItem('supabaseConfig');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        setSupabaseConfig(config);
      }
    } catch (error) {
      console.log('Ошибка загрузки конфигурации Supabase');
    }
  }, []);

  useEffect(() => {
    if (supabaseConnected && tablesCreated) {
      loadEmployeeStats();
      loadSavedPeriods();
    }
  }, [supabaseConnected, tablesCreated]);

  const SQL_SCRIPTS = `-- Создание таблиц для калькулятора зарплаты

-- Таблица для настроек формулы
CREATE TABLE salary_formulas (
  id BIGINT PRIMARY KEY DEFAULT 1,
  shift_rate NUMERIC NOT NULL DEFAULT 1000,
  internship_rate NUMERIC NOT NULL DEFAULT 1000,
  total_bar_amount NUMERIC NOT NULL DEFAULT 100000,
  bar_percentage NUMERIC NOT NULL DEFAULT 0.07,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица для сотрудников
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shifts INTEGER NOT NULL DEFAULT 0,
  internship_shifts INTEGER NOT NULL DEFAULT 0,
  corkage_fee NUMERIC NOT NULL DEFAULT 0,
  penalties NUMERIC NOT NULL DEFAULT 0,
  bar_debt NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица для периодов расчёта
CREATE TABLE payroll_periods (
  id BIGINT PRIMARY KEY DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_bar_amount NUMERIC NOT NULL DEFAULT 100000,
  bar_percentage NUMERIC NOT NULL DEFAULT 0.07,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица для истории расчётов зарплат
CREATE TABLE payroll_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  shifts INTEGER NOT NULL DEFAULT 0,
  internship_shifts INTEGER NOT NULL DEFAULT 0,
  corkage_fee NUMERIC NOT NULL DEFAULT 0,
  penalties NUMERIC NOT NULL DEFAULT 0,
  bar_debt NUMERIC NOT NULL DEFAULT 0,
  total_salary NUMERIC NOT NULL DEFAULT 0,
  total_bar_amount NUMERIC NOT NULL DEFAULT 100000,
  bar_percentage NUMERIC NOT NULL DEFAULT 0.07,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включение Row Level Security (необязательно)
ALTER TABLE salary_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_history ENABLE ROW LEVEL SECURITY;

-- Создание политик (разрешить всё для анонимных пользователей)
CREATE POLICY "Allow all operations" ON salary_formulas FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON employees FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON payroll_periods FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON payroll_history FOR ALL USING (true);

-- Создание индексов для оптимизации запросов
CREATE INDEX idx_payroll_history_period ON payroll_history(period_start, period_end);
CREATE INDEX idx_payroll_history_employee ON payroll_history(employee_id, employee_name);
CREATE INDEX idx_payroll_history_created_at ON payroll_history(created_at);

-- Вставка начальных записей
INSERT INTO salary_formulas (id, shift_rate, internship_rate, total_bar_amount, bar_percentage) 
VALUES (1, 1000, 1000, 100000, 0.07) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO payroll_periods (id, start_date, end_date, total_bar_amount, bar_percentage) 
VALUES (1, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE, 100000, 0.07) 
ON CONFLICT (id) DO NOTHING;`;

  const loadLocalData = () => {
    try {
      const savedFormula = localStorage.getItem('salaryFormula');
      const savedEmployees = localStorage.getItem('employees');
      const savedPeriod = localStorage.getItem('payrollPeriod');
      
      if (savedFormula) {
        const parsed = JSON.parse(savedFormula);
        setFormula({
          shiftRate: parsed.shiftRate || 1000,
          internshipRate: parsed.internshipRate || 1000,
          totalBarAmount: parsed.totalBarAmount || 100000,
          barPercentage: parsed.barPercentage || 0.07
        });
      }
      
      if (savedEmployees) {
        setEmployees(JSON.parse(savedEmployees));
      }
      
      if (savedPeriod) {
        setPayrollPeriod(JSON.parse(savedPeriod));
      }
    } catch (error) {
      console.log('Ошибка загрузки данных из localStorage');
    }
  };

  const saveLocalData = () => {
    try {
      localStorage.setItem('salaryFormula', JSON.stringify(formula));
      localStorage.setItem('employees', JSON.stringify(employees));
      localStorage.setItem('payrollPeriod', JSON.stringify(payrollPeriod));
      toast.success('Данные сохранены локально');
    } catch (error) {
      toast.error('Ошибка сохранения данных');
    }
  };

  const getSupabaseClient = async () => {
    if (!supabaseClient && supabaseConfig.url && supabaseConfig.key) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        supabaseClient = createClient(supabaseConfig.url, supabaseConfig.key);
      } catch (error) {
        console.error('Error creating Supabase client:', error);
      }
    }
    return supabaseClient;
  };

  const createTablesIfNeeded = async (supabase: any) => {
    try {
      // Проверяем существование таблиц
      const { error: employeesError } = await supabase
        .from('employees')
        .select('count')
        .limit(1);
      
      const { error: formulaError } = await supabase
        .from('salary_formulas')
        .select('count')
        .limit(1);

      const { error: periodError } = await supabase
        .from('payroll_periods')
        .select('count')
        .limit(1);

      const { error: historyError } = await supabase
        .from('payroll_history')
        .select('count')
        .limit(1);

      if (employeesError?.code === '42P01' || formulaError?.code === 'PGRST204' || formulaError?.code === '42P01' || periodError?.code === '42P01' || historyError?.code === '42P01') {
        toast.error('Таблицы не найдены. Создайте их в Supabase SQL Editor, используя скрипт во вкладке Supabase.');
        return false;
      }
      
      setTablesCreated(true);
      return true;
    } catch (error) {
      console.error('Ошибка проверки таблиц:', error);
      return false;
    }
  };

  const connectSupabase = async () => {
    if (!supabaseConfig.url || !supabaseConfig.key) {
      toast.error('Заполните URL и ключ API Supabase');
      return;
    }

    try {
      setLoading(true);
      
      // Очистка предыдущего клиента
      supabaseClient = null;
      
      const supabase = await getSupabaseClient();
      
      if (!supabase) {
        throw new Error('Не удалось создать клиент Supabase');
      }
      
      // Тестирование подключения
      const { data, error } = await supabase.auth.getSession();
      
      const tablesExist = await createTablesIfNeeded(supabase);
      
      if (tablesExist) {
        setSupabaseConnected(true);
        toast.success('Подключение к Supabase успешно!');
        
        // Сохранение конфигурации
        localStorage.setItem('supabaseConfig', JSON.stringify(supabaseConfig));
      }
    } catch (error) {
      toast.error('Ошибка подключения к Supabase');
      console.error('Supabase connection error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async () => {
    if (!supabaseConnected || !tablesCreated) {
      saveLocalData();
      return;
    }

    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      
      if (!supabase) {
        throw new Error('Supabase клиент недоступен');
      }
      
      // Сохранение формулы
      const { error: formulaError } = await supabase
        .from('salary_formulas')
        .upsert({ 
          id: 1, 
          shift_rate: formula.shiftRate || 1000,
          internship_rate: formula.internshipRate || 1000,
          total_bar_amount: formula.totalBarAmount || 100000,
          bar_percentage: formula.barPercentage || 0.07
        });
      
      if (formulaError) throw formulaError;

      // Сохранение периода
      const { error: periodError } = await supabase
        .from('payroll_periods')
        .upsert({
          id: 1,
          start_date: payrollPeriod.startDate,
          end_date: payrollPeriod.endDate,
          total_bar_amount: formula.totalBarAmount || 100000,
          bar_percentage: formula.barPercentage || 0.07
        });
      
      if (periodError) throw periodError;

      // Сохранение сотрудников
      const employeesData = employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        shifts: emp.shifts || 0,
        internship_shifts: emp.internshipShifts || 0,
        corkage_fee: emp.corkageFee || 0,
        penalties: emp.penalties || 0,
        bar_debt: emp.barDebt || 0
      }));

      const { error: employeesError } = await supabase
        .from('employees')
        .upsert(employeesData);
      
      if (employeesError) throw employeesError;

      toast.success('Данные сохранены в Supabase');
    } catch (error) {
      toast.error('Ошибка сохранения в Supabase, сохранено локально');
      saveLocalData();
      console.error('Supabase save error:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePayrollToHistory = async () => {
    if (!supabaseConnected || !tablesCreated) {
      toast.error('Подключитесь к Supabase для сохранения истории');
      return;
    }

    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      const calculatedSalaries = employees.map(calculateSalary);
      
      // Подготовка данных для сохранения в историю
      const historyData = calculatedSalaries.map(calc => ({
        period_start: payrollPeriod.startDate,
        period_end: payrollPeriod.endDate,
        employee_id: calc.employee.id,
        employee_name: calc.employee.name,
        shifts: calc.employee.shifts || 0,
        internship_shifts: calc.employee.internshipShifts || 0,
        corkage_fee: calc.employee.corkageFee || 0,
        penalties: calc.employee.penalties || 0,
        bar_debt: calc.employee.barDebt || 0,
        total_salary: calc.total || 0,
        total_bar_amount: formula.totalBarAmount || 100000,
        bar_percentage: formula.barPercentage || 0.07
      }));

      const { error } = await supabase
        .from('payroll_history')
        .insert(historyData);
      
      if (error) throw error;

      toast.success(`Расчёт за период ${formatDateRange()} сохранён в историю`);
      
      // Обновляем статистику
      await loadEmployeeStats();
      await loadSavedPeriods();
    } catch (error) {
      toast.error('Ошибка сохранения в историю');
      console.error('Save to history error:', error);
    } finally {
      setLoading(false);
    }
  };

  const deletePeriodFromHistory = async (periodId: string) => {
    if (!supabaseConnected || !tablesCreated) {
      toast.error('Подключитесь к Supabase для удаления');
      return;
    }

    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      const [startDate, endDate] = periodId.split('_');
      
      const { error } = await supabase
        .from('payroll_history')
        .delete()
        .eq('period_start', startDate)
        .eq('period_end', endDate);
      
      if (error) throw error;

      toast.success('Период удалён из истории');
      
      // Обновляем списки
      await loadEmployeeStats();
      await loadSavedPeriods();
    } catch (error) {
      toast.error('Ошибка удаления периода');
      console.error('Delete period error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeStats = async () => {
    if (!supabaseConnected || !tablesCreated) return;

    try {
      const supabase = await getSupabaseClient();
      
      const { data, error } = await supabase
        .from('payroll_history')
        .select('*');
      
      if (error) throw error;
      
      // Агрегируем данные по сотрудникам
      const statsMap = new Map<string, EmployeeStats>();
      
      data.forEach((record: PayrollHistory) => {
        const existing = statsMap.get(record.employee_name) || {
          employee_name: record.employee_name,
          total_shifts: 0,
          total_internship_shifts: 0,
          total_corkage_fee: 0,
          total_penalties: 0,
          total_bar_debt: 0,
          total_salary: 0,
          periods_count: 0
        };
        
        existing.total_shifts += record.shifts || 0;
        existing.total_internship_shifts += record.internship_shifts || 0;
        existing.total_corkage_fee += record.corkage_fee || 0;
        existing.total_penalties += record.penalties || 0;
        existing.total_bar_debt += record.bar_debt || 0;
        existing.total_salary += record.total_salary || 0;
        existing.periods_count += 1;
        
        statsMap.set(record.employee_name, existing);
      });
      
      setEmployeeStats(Array.from(statsMap.values()));
    } catch (error) {
      console.error('Error loading employee stats:', error);
    }
  };

  const loadSavedPeriods = async () => {
    if (!supabaseConnected || !tablesCreated) return;

    try {
      const supabase = await getSupabaseClient();
      
      const { data, error } = await supabase
        .from('payroll_history')
        .select('period_start, period_end, total_salary, total_bar_amount, bar_percentage, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Группируем по периодам
      const periodsMap = new Map<string, SavedPeriod>();
      
      data.forEach((record: any) => {
        const periodKey = `${record.period_start}_${record.period_end}`;
        const existing = periodsMap.get(periodKey);
        
        if (existing) {
          existing.total_employees += 1;
          existing.total_payroll += record.total_salary || 0;
        } else {
          periodsMap.set(periodKey, {
            id: periodKey,
            period_start: record.period_start,
            period_end: record.period_end,
            total_employees: 1,
            total_payroll: record.total_salary || 0,
            total_bar_amount: record.total_bar_amount || 0,
            bar_percentage: record.bar_percentage || 0.07,
            created_at: record.created_at
          });
        }
      });
      
      setSavedPeriods(Array.from(periodsMap.values()));
    } catch (error) {
      console.error('Error loading saved periods:', error);
    }
  };

  const loadFromSupabase = async () => {
    if (!supabaseConnected || !tablesCreated) {
      loadLocalData();
      return;
    }

    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      
      // Загрузка формулы
      const { data: formulaData, error: formulaError } = await supabase
        .from('salary_formulas')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (formulaData && !formulaError) {
        setFormula({
          shiftRate: formulaData.shift_rate || 1000,
          internshipRate: formulaData.internship_rate || 1000,
          totalBarAmount: formulaData.total_bar_amount || 100000,
          barPercentage: formulaData.bar_percentage || 0.07
        });
      }

      // Загрузка периода
      const { data: periodData, error: periodError } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (periodData && !periodError) {
        setPayrollPeriod({
          startDate: periodData.start_date,
          endDate: periodData.end_date
        });
      }

      // Загрузка сотрудников
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      
      if (employeesData && !employeesError) {
        const mappedEmployees = employeesData.map((emp: any) => ({
          id: emp.id,
          name: emp.name,
          shifts: emp.shifts || 0,
          internshipShifts: emp.internship_shifts || 0,
          corkageFee: emp.corkage_fee || 0,
          penalties: emp.penalties || 0,
          barDebt: emp.bar_debt || 0
        }));
        setEmployees(mappedEmployees);
      }
      
      toast.success('Данные загружены из Supabase');
    } catch (error) {
      toast.error('Ошибка загрузки из Supabase, используются локальные данные');
      loadLocalData();
      console.error('Supabase load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodFromHistory = async (periodId: string) => {
    if (!supabaseConnected || !tablesCreated) return;

    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      const [startDate, endDate] = periodId.split('_');
      
      const { data, error } = await supabase
        .from('payroll_history')
        .select('*')
        .eq('period_start', startDate)
        .eq('period_end', endDate);
      
      if (error) throw error;
      
      if (data.length === 0) {
        toast.error('Данные для этого периода не найдены');
        return;
      }
      
      // Устанавливаем период
      setPayrollPeriod({
        startDate: startDate,
        endDate: endDate
      });
      
      // Обновляем формулу из истории
      if (data[0]) {
        setFormula(prev => ({
          ...prev,
          totalBarAmount: data[0].total_bar_amount || 100000,
          barPercentage: data[0].bar_percentage || 0.07
        }));
      }
      
      // Восстанавливаем данные сотрудников из истории
      const restoredEmployees = data.map((record: PayrollHistory) => ({
        id: record.employee_id,
        name: record.employee_name,
        shifts: record.shifts || 0,
        internshipShifts: record.internship_shifts || 0,
        corkageFee: record.corkage_fee || 0,
        penalties: record.penalties || 0,
        barDebt: record.bar_debt || 0
      }));
      
      setEmployees(restoredEmployees);
      toast.success(`Загружен период: ${formatDateForPeriod(startDate, endDate)}`);
    } catch (error) {
      toast.error('Ошибка загрузки периода');
      console.error('Load period error:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCRIPTS);
      setCopied(true);
      toast.success('SQL скрипт скопирован в буфер обмена');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Ошибка копирования');
    }
  };

  const calculateSalary = (employee: Employee): CalculatedSalary => {
    try {
      // Расчёт смен
      const regularShifts = Math.max(0, (employee.shifts || 0) - (employee.internshipShifts || 0));
      const internshipShifts = employee.internshipShifts || 0;
      
      // Расчёт зарплаты за смены
      const fromShifts = regularShifts * (formula.shiftRate || 1000);
      // Стажёрские смены теперь просто умножаются на ставку (без деления на 4)
      const fromInternshipShifts = internshipShifts * (formula.internshipRate || 1000);
      
      // Новая формула расчёта доли от бара: a * b / c
      // a = totalBarAmount, b = barPercentage, c = количество сотрудников
      const employeeCount = employees.length;
      const fromBar = regularShifts > 0 && employeeCount > 0 ? 
        ((formula.totalBarAmount || 0) * (formula.barPercentage || 0)) / employeeCount : 0;
      
      const breakdown = {
        fromShifts,
        fromInternshipShifts,
        fromBar,
        fromCorkageFee: employee.corkageFee || 0,
        fromPenalties: employee.penalties || 0,
        fromBarDebt: employee.barDebt || 0,
      };

      const total = breakdown.fromShifts + breakdown.fromInternshipShifts + breakdown.fromBar + 
                    breakdown.fromCorkageFee - breakdown.fromPenalties - breakdown.fromBarDebt;

      return { 
        employee, 
        breakdown, 
        total,
        isIntern: internshipShifts > 0,
        regularShifts
      };
    } catch (error) {
      console.error('Error calculating salary:', error);
      return { 
        employee, 
        breakdown: {
          fromShifts: 0,
          fromInternshipShifts: 0,
          fromBar: 0,
          fromCorkageFee: 0,
          fromPenalties: 0,
          fromBarDebt: 0,
        }, 
        total: 0,
        isIntern: false,
        regularShifts: 0
      };
    }
  };

  const addEmployee = () => {
    const newEmployee: Employee = {
      id: Date.now().toString(),
      name: 'Новый сотрудник',
      shifts: 0,
      internshipShifts: 0,
      corkageFee: 0,
      penalties: 0,
      barDebt: 0,
    };
    setEmployees([...employees, newEmployee]);
  };

  const removeEmployee = (id: string) => {
    setEmployees(employees.filter(emp => emp.id !== id));
  };

  const updateEmployee = (id: string, field: keyof Omit<Employee, 'id'>, value: string | number) => {
    setEmployees(employees.map(emp => 
      emp.id === id ? { ...emp, [field]: value } : emp
    ));
  };

  const updateFormula = (field: keyof SalaryFormula, value: number) => {
    setFormula({ ...formula, [field]: value });
  };

  const updatePayrollPeriod = (field: keyof PayrollPeriod, value: string) => {
    setPayrollPeriod({ ...payrollPeriod, [field]: value });
  };

  const formatDateRange = () => {
    try {
      const startDate = new Date(payrollPeriod.startDate);
      const endDate = new Date(payrollPeriod.endDate);
      
      const formatOptions: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      };
      
      return `${startDate.toLocaleDateString('ru-RU', formatOptions)} — ${endDate.toLocaleDateString('ru-RU', formatOptions)}`;
    } catch (error) {
      return 'Период не выбран';
    }
  };

  const formatDateForPeriod = (startDate: string, endDate: string) => {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const formatOptions: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      };
      
      return `${start.toLocaleDateString('ru-RU', formatOptions)} — ${end.toLocaleDateString('ru-RU', formatOptions)}`;
    } catch (error) {
      return 'Неверный период';
    }
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const calculatedSalaries = employees.map(calculateSalary);
  const totalPayroll = calculatedSalaries.reduce((sum, calc) => sum + (calc.total || 0), 0);
  
  // Подсчёт общего количества смен
  const totalRegularShifts = employees.reduce((sum, emp) => sum + Math.max(0, (emp.shifts || 0) - (emp.internshipShifts || 0)), 0);
  const totalInternshipShifts = employees.reduce((sum, emp) => sum + (emp.internshipShifts || 0), 0);
  const totalShifts = totalRegularShifts + totalInternshipShifts;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-2 sm:p-4">
        {/* Мобильный заголовок */}
        <div className="mb-4 sm:mb-8">
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl">Калькулятор зарплаты</h1>
              <p className="text-sm text-muted-foreground">
                Расчёт зарплаты сотрудников с настраиваемой формулой
              </p>
            </div>
            
            {/* Мобильные кнопки */}
            <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:space-x-2 sm:items-center">
              <div className="flex items-center justify-center space-x-2 sm:order-1">
                <Sun className="h-4 w-4" />
                <Switch
                  checked={isDarkMode}
                  onCheckedChange={setIsDarkMode}
                />
                <Moon className="h-4 w-4" />
              </div>
              
              <div className="flex items-center space-x-2 sm:order-2">
                <Badge variant={supabaseConnected && tablesCreated ? "default" : "secondary"} className="text-xs">
                  <Database className="w-3 h-3 mr-1" />
                  {supabaseConnected && tablesCreated ? 'Supabase' : 'Локально'}
                </Badge>
                
                <Button onClick={loadFromSupabase} variant="outline" size="sm" disabled={loading}>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Загрузить</span>
                </Button>
                
                <Button onClick={saveToSupabase} size="sm" disabled={loading}>
                  <Save className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Сохранить</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="calculator" className="space-y-4 sm:space-y-6">
          {/* Мобильные вкладки с прокруткой */}
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full gap-1 h-auto p-1">
            <TabsTrigger value="calculator" className="text-xs px-1 sm:px-3 py-2">
              Расчёт
            </TabsTrigger>
            <TabsTrigger value="employees" className="text-xs px-1 sm:px-3 py-2">
              Сотрудники
            </TabsTrigger>
            <TabsTrigger value="formula" className="text-xs px-1 sm:px-3 py-2">
              Формула
            </TabsTrigger>
            <TabsTrigger value="statistics" className="text-xs px-1 sm:px-3 py-2">
              Статистика
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs px-1 sm:px-3 py-2">
              История
            </TabsTrigger>
            <TabsTrigger value="supabase" className="text-xs px-1 sm:px-3 py-2">
              Supabase
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-4 sm:space-y-6">
            {/* Настройка периода расчёта */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    <span className="text-base sm:text-lg">Период расчёта</span>
                  </div>
                  <Button 
                    onClick={savePayrollToHistory} 
                    disabled={loading || !supabaseConnected}
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    <History className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Сохранить в историю
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="startDate" className="text-sm">Дата начала</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={payrollPeriod.startDate}
                      onChange={(e) => updatePayrollPeriod('startDate', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="endDate" className="text-sm">Дата окончания</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={payrollPeriod.endDate}
                      onChange={(e) => updatePayrollPeriod('endDate', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="totalBarAmount" className="text-sm">Сумма бара (₽)</Label>
                    <Input
                      id="totalBarAmount"
                      type="number"
                      value={formula.totalBarAmount || 0}
                      onChange={(e) => updateFormula('totalBarAmount', parseFloat(e.target.value) || 0)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="barPercentage" className="text-sm">Процент с бара</Label>
                    <Input
                      id="barPercentage"
                      type="number"
                      step="0.001"
                      min="0"
                      max="1"
                      value={formula.barPercentage || 0}
                      onChange={(e) => updateFormula('barPercentage', parseFloat(e.target.value) || 0)}
                      placeholder="0.07"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatPercentage(formula.barPercentage || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Результаты расчёта */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg">Результаты расчёта</h3>
                    <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                      <div>{formatDateRange()}</div>
                      <div>Бар: {safeToLocaleString(formula.totalBarAmount)} ₽ ({formatPercentage(formula.barPercentage || 0)})</div>
                      <div>Смен: {totalShifts} ({totalRegularShifts} обычных, {totalInternshipShifts} стажёрских)</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs sm:text-sm whitespace-nowrap">
                    Фонд: {safeToLocaleString(totalPayroll)} ₽
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {/* Мобильная версия - карточки */}
                <div className="block sm:hidden space-y-3 p-4">
                  {calculatedSalaries.map((calc) => (
                    <Card key={calc.employee.id} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm truncate">{calc.employee.name}</span>
                            {calc.isIntern && (
                              <Badge variant="outline" className="text-xs">
                                <UserCheck className="w-3 h-3 mr-1" />
                                Стажёр
                              </Badge>
                            )}
                          </div>
                          <Badge variant={calc.total >= 0 ? "default" : "destructive"} className="text-xs">
                            {safeToLocaleString(calc.total)} ₽
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-1">
                            {calc.regularShifts > 0 && (
                              <div className="text-green-600">+{safeToLocaleString(calc.breakdown.fromShifts)} ₽ (смены)</div>
                            )}
                            {calc.breakdown.fromInternshipShifts > 0 && (
                              <div className="text-green-600">+{safeToLocaleString(calc.breakdown.fromInternshipShifts)} ₽ (стажёр)</div>
                            )}
                            <div className="text-green-600">+{safeToLocaleString(calc.breakdown.fromBar)} ₽ (бар)</div>
                            <div className="text-green-600">+{safeToLocaleString(calc.breakdown.fromCorkageFee)} ₽ (пробки)</div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Смены:</span>
                              <span>{calc.regularShifts + (calc.employee.internshipShifts || 0)}</span>
                            </div>
                            <div className="text-red-600">-{safeToLocaleString(calc.breakdown.fromPenalties)} ₽ (штрафы)</div>
                            <div className="text-red-600">-{safeToLocaleString(calc.breakdown.fromBarDebt)} ₽ (долги)</div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Десктоп версия - таблица */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сотрудник</TableHead>
                        <TableHead className="text-center">Смены</TableHead>
                        <TableHead className="text-right">За смены</TableHead>
                        <TableHead className="text-right">% с бара</TableHead>
                        <TableHead className="text-right">Пробковый сбор</TableHead>
                        <TableHead className="text-right">Штрафы</TableHead>
                        <TableHead className="text-right">Долги</TableHead>
                        <TableHead className="text-right">Итого</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculatedSalaries.map((calc) => (
                        <TableRow key={calc.employee.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {calc.employee.name}
                              {calc.isIntern && (
                                <Badge variant="outline" className="text-xs">
                                  <UserCheck className="w-3 h-3 mr-1" />
                                  Стажёр
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col gap-1">
                              {calc.regularShifts > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {calc.regularShifts} обычных
                                </Badge>
                              )}
                              {(calc.employee.internshipShifts || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {calc.employee.internshipShifts} стажёрских
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            <div className="flex flex-col">
                              {calc.breakdown.fromShifts > 0 && (
                                <span>+{safeToLocaleString(calc.breakdown.fromShifts)} ₽</span>
                              )}
                              {calc.breakdown.fromInternshipShifts > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  +{safeToLocaleString(calc.breakdown.fromInternshipShifts)} ₽ (стажировка)
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            +{safeToLocaleString(calc.breakdown.fromBar)} ₽
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            +{safeToLocaleString(calc.breakdown.fromCorkageFee)} ₽
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            -{safeToLocaleString(calc.breakdown.fromPenalties)} ₽
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            -{safeToLocaleString(calc.breakdown.fromBarDebt)} ₽
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={calc.total >= 0 ? "default" : "destructive"}>
                              {safeToLocaleString(calc.total)} ₽
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employees" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-base sm:text-lg">Управление сотрудниками</span>
                  <Button onClick={addEmployee} size="sm" className="w-full sm:w-auto">
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Добавить сотрудника
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {employees.map((employee) => (
                    <Card key={employee.id} className="p-3 sm:p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4">
                        <div className="sm:col-span-2 lg:col-span-2 xl:col-span-1 space-y-1">
                          <Label htmlFor={`name-${employee.id}`} className="text-sm">Имя</Label>
                          <Input
                            id={`name-${employee.id}`}
                            value={employee.name}
                            onChange={(e) => updateEmployee(employee.id, 'name', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shifts-${employee.id}`} className="text-sm">Обычные смены</Label>
                          <Input
                            id={`shifts-${employee.id}`}
                            type="number"
                            value={employee.shifts || 0}
                            onChange={(e) => updateEmployee(employee.id, 'shifts', parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`internship-${employee.id}`} className="text-sm">Стажёрские</Label>
                          <Input
                            id={`internship-${employee.id}`}
                            type="number"
                            value={employee.internshipShifts || 0}
                            onChange={(e) => updateEmployee(employee.id, 'internshipShifts', parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`corkage-${employee.id}`} className="text-sm">Пробки (₽)</Label>
                          <Input
                            id={`corkage-${employee.id}`}
                            type="number"
                            value={employee.corkageFee || 0}
                            onChange={(e) => updateEmployee(employee.id, 'corkageFee', parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`penalties-${employee.id}`} className="text-sm">Штрафы (₽)</Label>
                          <Input
                            id={`penalties-${employee.id}`}
                            type="number"
                            value={employee.penalties || 0}
                            onChange={(e) => updateEmployee(employee.id, 'penalties', parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`debt-${employee.id}`} className="text-sm">Долги (₽)</Label>
                          <Input
                            id={`debt-${employee.id}`}
                            type="number"
                            value={employee.barDebt || 0}
                            onChange={(e) => updateEmployee(employee.id, 'barDebt', parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div className="flex items-end justify-center sm:justify-start">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeEmployee(employee.id)}
                            disabled={employees.length === 1}
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="formula" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Настройка формулы расчёта
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm sm:text-base">Ставки оплаты</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="shiftRate" className="text-sm">Оплата за обычную смену (₽)</Label>
                        <Input
                          id="shiftRate"
                          type="number"
                          value={formula.shiftRate || 0}
                          onChange={(e) => updateFormula('shiftRate', parseFloat(e.target.value) || 0)}
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Множится на количество обычных смен
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="internshipRate" className="text-sm">Ставка за стажёрскую смену (₽)</Label>
                        <Input
                          id="internshipRate"
                          type="number"
                          value={formula.internshipRate || 0}
                          onChange={(e) => updateFormula('internshipRate', parseFloat(e.target.value) || 0)}
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Множится на количество стажёрских смен
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="totalBarAmountFormula" className="text-sm">Общая сумма бара (₽)</Label>
                        <Input
                          id="totalBarAmountFormula"
                          type="number"
                          value={formula.totalBarAmount || 0}
                          onChange={(e) => updateFormula('totalBarAmount', parseFloat(e.target.value) || 0)}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="barPercentageFormula" className="text-sm">Процент с бара</Label>
                        <Input
                          id="barPercentageFormula"
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={formula.barPercentage || 0}
                          onChange={(e) => updateFormula('barPercentage', parseFloat(e.target.value) || 0)}
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Текущий: {formatPercentage(formula.barPercentage || 0)} (например: 0.07 для 7%)
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-sm sm:text-base">Особенности расчёта</h3>
                    <div className="space-y-3">
                      <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <h4 className="text-sm mb-2">Стажёры:</h4>
                        <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                          Стажёрские смены просто умножаются на ставку стажёра. 
                          Количество стажёрских смен не ограничено.
                        </p>
                      </div>
                      <div className="p-3 sm:p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                        <h4 className="text-sm mb-2">Новая формула расчёта доли от бара:</h4>
                        <p className="text-xs text-green-800 dark:text-green-200">
                          (Сумма бара × Процент) ÷ Количество сотрудников
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                          Стажёры не получают долю от бара
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-3 sm:p-4 bg-muted rounded-lg">
                  <h4 className="text-sm mb-2">Формула расчёта:</h4>
                  <p className="text-xs sm:text-sm break-words">
                    <span className="font-mono">
                      Зарплата = (Обычные смены × {safeToLocaleString(formula.shiftRate)}) + 
                      (Стажёрские смены × {safeToLocaleString(formula.internshipRate)}) + 
                      Доля от бара + Пробковый сбор - Штрафы - Долги
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 break-words">
                    Доля от бара = ({safeToLocaleString(formula.totalBarAmount)} × {formatPercentage(formula.barPercentage || 0)}) ÷ {employees.length} = {safeToLocaleString(employees.length > 0 ? ((formula.totalBarAmount || 0) * (formula.barPercentage || 0)) / employees.length : 0)} ₽ на сотрудника
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Общая статистика за всё время
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!supabaseConnected ? (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Подключитесь к Supabase для просмотра статистики
                    </p>
                  </div>
                ) : employeeStats.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Нет данных для статистики. Сохраните несколько расчётов в историю.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Мобильная версия - карточки */}
                    <div className="block sm:hidden space-y-3">
                      {employeeStats.map((stats) => (
                        <Card key={stats.employee_name} className="p-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="truncate">{stats.employee_name}</span>
                              <Badge variant="default" className="text-xs">
                                {safeToLocaleString(stats.total_salary)} ₽
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="space-y-1">
                                <div>Периодов: {stats.periods_count}</div>
                                <div>Обычных смен: {stats.total_shifts}</div>
                                <div>Стажёрских: {stats.total_internship_shifts}</div>
                                <div className="text-green-600">Пробки: {safeToLocaleString(stats.total_corkage_fee)} ₽</div>
                              </div>
                              <div className="space-y-1 text-right">
                                <div className="text-red-600">Штрафы: {safeToLocaleString(stats.total_penalties)} ₽</div>
                                <div className="text-red-600">Долги: {safeToLocaleString(stats.total_bar_debt)} ₽</div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {/* Десктоп версия - таблица */}
                    <div className="hidden sm:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Сотрудник</TableHead>
                            <TableHead className="text-center">Периодов</TableHead>
                            <TableHead className="text-center">Обычных смен</TableHead>
                            <TableHead className="text-center">Стажёрских смен</TableHead>
                            <TableHead className="text-right">Пробковый сбор</TableHead>
                            <TableHead className="text-right">Штрафы</TableHead>
                            <TableHead className="text-right">Долги</TableHead>
                            <TableHead className="text-right">Общая зарплата</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {employeeStats.map((stats) => (
                            <TableRow key={stats.employee_name}>
                              <TableCell>{stats.employee_name}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">
                                  {stats.periods_count}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">
                                  {stats.total_shifts}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">
                                  {stats.total_internship_shifts}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-green-600">
                                {safeToLocaleString(stats.total_corkage_fee)} ₽
                              </TableCell>
                              <TableCell className="text-right text-red-600">
                                {safeToLocaleString(stats.total_penalties)} ₽
                              </TableCell>
                              <TableCell className="text-right text-red-600">
                                {safeToLocaleString(stats.total_bar_debt)} ₽
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="default">
                                  {safeToLocaleString(stats.total_salary)} ₽
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <History className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Сохранённые периоды
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!supabaseConnected ? (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Подключитесь к Supabase для работы с историей
                    </p>
                  </div>
                ) : savedPeriods.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Нет сохранённых периодов. Сохраните текущий расчёт в историю.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Загрузить сохранённый период</Label>
                      <Select onValueChange={loadPeriodFromHistory}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Выберите период для загрузки" />
                        </SelectTrigger>
                        <SelectContent>
                          {savedPeriods.map((period) => (
                            <SelectItem key={period.id} value={period.id} className="text-sm">
                              {formatDateForPeriod(period.period_start, period.period_end)} 
                              ({period.total_employees} сотр., {safeToLocaleString(period.total_payroll)} ₽)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Мобильная версия - карточки */}
                    <div className="block sm:hidden space-y-3">
                      {savedPeriods.map((period) => (
                        <Card key={period.id} className="p-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm truncate">
                                {formatDateForPeriod(period.period_start, period.period_end)}
                              </span>
                              <div className="flex space-x-1">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => loadPeriodFromHistory(period.id)}
                                  disabled={loading}
                                  className="h-7 w-7 p-0"
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => deletePeriodFromHistory(period.id)}
                                  disabled={loading}
                                  className="h-7 w-7 p-0"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="space-y-1">
                                <div>Сотрудников: {period.total_employees}</div>
                                <div>Бар: {formatPercentage(period.bar_percentage || 0)}</div>
                              </div>
                              <div className="space-y-1 text-right">
                                <div>{safeToLocaleString(period.total_bar_amount)} ₽</div>
                                <div className="text-green-600">{safeToLocaleString(period.total_payroll)} ₽</div>
                              </div>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              {new Date(period.created_at).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {/* Десктоп версия - таблица */}
                    <div className="hidden sm:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Период</TableHead>
                            <TableHead className="text-center">Сотрудников</TableHead>
                            <TableHead className="text-right">Сумма бара</TableHead>
                            <TableHead className="text-right">% бара</TableHead>
                            <TableHead className="text-right">Общий фонд</TableHead>
                            <TableHead className="text-center">Дата сохранения</TableHead>
                            <TableHead className="text-center">Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {savedPeriods.map((period) => (
                            <TableRow key={period.id}>
                              <TableCell>
                                {formatDateForPeriod(period.period_start, period.period_end)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">
                                  {period.total_employees}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {safeToLocaleString(period.total_bar_amount)} ₽
                              </TableCell>
                              <TableCell className="text-right">
                                {formatPercentage(period.bar_percentage || 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {safeToLocaleString(period.total_payroll)} ₽
                              </TableCell>
                              <TableCell className="text-center">
                                {new Date(period.created_at).toLocaleDateString('ru-RU')}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex gap-1 justify-center">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => loadPeriodFromHistory(period.id)}
                                    disabled={loading}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => deletePeriodFromHistory(period.id)}
                                    disabled={loading}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="supabase" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <Database className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Настройка Supabase
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!supabaseConnected ? (
                    <>
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                          Подключите Supabase для синхронизации данных между устройствами и создания резервных копий.
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-300">
                          Пока Supabase не подключен, данные сохраняются локально в браузере.
                        </p>
                      </div>
                      
                      <div className="space-y-1">
                        <Label htmlFor="supabaseUrl" className="text-sm">URL проекта Supabase</Label>
                        <Input
                          id="supabaseUrl"
                          placeholder="https://ваш-проект.supabase.co"
                          value={supabaseConfig.url}
                          onChange={(e) => setSupabaseConfig({...supabaseConfig, url: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <Label htmlFor="supabaseKey" className="text-sm">Anon public ключ</Label>
                        <Input
                          id="supabaseKey"
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          value={supabaseConfig.key}
                          onChange={(e) => setSupabaseConfig({...supabaseConfig, key: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      
                      <Button onClick={connectSupabase} disabled={loading} className="w-full sm:w-auto">
                        Подключить Supabase
                      </Button>
                    </>
                  ) : (
                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        ✅ Supabase подключен успешно! Данные будут автоматически синхронизироваться.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => {
                          setSupabaseConnected(false);
                          setTablesCreated(false);
                          setSupabaseConfig({url: '', key: ''});
                          localStorage.removeItem('supabaseConfig');
                          supabaseClient = null;
                        }}
                      >
                        Отключить
                      </Button>
                    </div>
                  )}

                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between mb-2">
                      <h4 className="text-sm">SQL скрипт для создания таблиц:</h4>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 w-full sm:w-auto"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Скопировано' : 'Копировать'}
                      </Button>
                    </div>
                    <div className="text-sm space-y-2">
                      <p className="mb-2">Выполните этот SQL скрипт в Supabase SQL Editor:</p>
                      <pre className="bg-background p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap border">
                        {SQL_SCRIPTS}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}