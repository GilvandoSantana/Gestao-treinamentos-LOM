import { useState } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, GraduationCap, BarChart3 } from 'lucide-react';
import type { Employee } from '@/lib/types';
import { getStatistics } from '@/lib/training-utils';

interface ComplianceChartsProps {
  employees: Employee[];
}

export default function ComplianceCharts({ employees }: ComplianceChartsProps) {
  const [showChart, setShowChart] = useState(false);
  const stats = getStatistics(employees);

  // Data for training status distribution
  const trainingStatusData = [
    {
      name: 'Válidos',
      value: stats.valid,
      percentage: stats.total > 0 ? Math.round((stats.valid / stats.total) * 100) : 0,
    },
    {
      name: 'Próximos a Vencer',
      value: stats.expiring,
      percentage: stats.total > 0 ? Math.round((stats.expiring / stats.total) * 100) : 0,
    },
    {
      name: 'Vencidos',
      value: stats.expired,
      percentage: stats.total > 0 ? Math.round((stats.expired / stats.total) * 100) : 0,
    },
  ];

  // Data for education level distribution
  const educationLevels = [
    'Ensino Fundamental',
    'Ensino Médio',
    'Ensino Técnico',
    'Ensino Superior'
  ];

  const educationData = educationLevels.map(level => {
    const count = employees.filter(e => e.educationLevel === level).length;
    return {
      name: level,
      value: count,
      percentage: employees.length > 0 ? Math.round((count / employees.length) * 100) : 0
    };
  }).filter(item => item.value > 0);

  // If no education data is set, show a placeholder for the chart
  const hasEducationData = educationData.length > 0;

  // Data for age range distribution
  const ageRanges = [
    { label: '21-25', min: 21, max: 25 },
    { label: '26-30', min: 26, max: 30 },
    { label: '31-40', min: 31, max: 40 },
    { label: '41-50', min: 41, max: 50 },
    { label: '50+', min: 51, max: 200 }
  ];

  const ageData = ageRanges.map(range => {
    const count = employees.filter(e => {
      const age = e.age;
      return age && age >= range.min && age <= range.max;
    }).length;
    return {
      name: range.label,
      value: count,
      percentage: employees.length > 0 ? Math.round((count / employees.length) * 100) : 0
    };
  }).filter(item => item.value > 0);

  const hasAgeData = ageData.length > 0;

  const TRAINING_COLORS = ['#2d9f7f', '#fbbf24', '#ef4444'];
  const EDUCATION_COLORS = ['#1e3a8a', '#e8772e', '#2d9f7f', '#6366f1', '#ec4899'];
  const AGE_COLORS = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444'];

  const renderCustomLabel = (entry: any) => {
    return `${entry.percentage}%`;
  };

  return (
    <div className="mb-8">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header with Toggle Button */}
        <div 
          className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" 
          onClick={() => setShowChart(!showChart)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange/10 rounded-lg">
              <BarChart3 size={20} className="text-orange" />
            </div>
            <h3 className="text-lg font-bold text-navy">Indicadores e Estatísticas</h3>
          </div>
          <ChevronDown
            size={24}
            className={`text-orange transition-transform duration-300 ${showChart ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Chart Content - Hidden by Default */}
        {showChart && (
          <div className="px-6 pb-8 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mt-6">
              
              {/* Training Status Chart */}
              <div className="flex flex-col items-center">
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Status de Treinamentos</h4>
                <div className="w-full h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trainingStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomLabel}
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {trainingStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={TRAINING_COLORS[index % TRAINING_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        formatter={(value: number, name: string, props: any) => [
                          `${value} item${value !== 1 ? 's' : ''} (${props.payload.percentage}%)`,
                          name,
                        ]}
                      />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Education Level Chart */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Nível de Escolaridade</h4>
                </div>
                {hasEducationData ? (
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={educationData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomLabel}
                          outerRadius={80}
                          innerRadius={40}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {educationData.map((entry, index) => (
                            <Cell key={`cell-edu-${index}`} fill={EDUCATION_COLORS[index % EDUCATION_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          formatter={(value: number, name: string, props: any) => [
                            `${value} colaborador${value !== 1 ? 'es' : ''} (${props.payload.percentage}%)`,
                            name,
                          ]}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <GraduationCap size={40} className="text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm text-center px-4">
                      Nenhum dado de escolaridade preenchido para gerar o gráfico.
                    </p>
                  </div>
                )}
              </div>

              {/* Age Range Chart */}
              <div className="flex flex-col items-center">
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Faixa Etária</h4>
                {hasAgeData ? (
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ageData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomLabel}
                          outerRadius={80}
                          innerRadius={40}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {ageData.map((entry, index) => (
                            <Cell key={`cell-age-${index}`} fill={AGE_COLORS[index % AGE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          formatter={(value: number, name: string, props: any) => [
                            `${value} colaborador${value !== 1 ? 'es' : ''} (${props.payload.percentage}%)`,
                            name,
                          ]}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] w-full bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <GraduationCap size={40} className="text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm text-center px-4">
                      Nenhum dado de idade preenchido para gerar o gráfico.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
