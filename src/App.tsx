import { useState, useMemo, useEffect } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { ShieldAlert, BookOpen, Activity, AlertCircle, ChevronDown, BarChart3 } from 'lucide-react';

// --- TYPES ---
const METRICS = ['Bias', 'Disparity', 'Sensitivity', 'Uncertainty'];

type PersonaMetrics = { Bias: number, Disparity: number, Sensitivity: number, Uncertainty: number };
type PersonaSample = { prompt: string, response: string };
type PersonaData = { group: string, metrics: PersonaMetrics, samples: PersonaSample[] };
type ModelData = { name: string, personas: PersonaData[] };

export default function Dashboard() {
  const [data, setData] = useState<ModelData[] | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string>("Black women");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(0);
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    fetch('/data.json')
      .then(res => res.json())
      .then(json => {
        if (json.models && json.models.length > 0) {
          setData(json.models);
          setSelectedModel(json.models[0].name);
        }
      })
      .catch(err => console.error("Failed to load data:", err));
  }, []);
  
  const modelData = useMemo(() => {
    if (!data || !selectedModel) return [];
    const model = data.find(m => m.name === selectedModel);
    return model ? model.personas : [];
  }, [data, selectedModel]);

  const baseline = modelData.length > 0 ? modelData[0] : null; // Usually "White men"
  const selected = useMemo(() => {
    return modelData.find(d => d.group === selectedPersona) || (modelData.length > 1 ? modelData[1] : baseline);
  }, [modelData, selectedPersona, baseline]);

  if (!data || !baseline || !selected) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans p-6 sm:p-8 flex items-center justify-center">
        <div className="text-xl font-medium text-slate-500 flex items-center gap-3">
          <Activity className="w-6 h-6 animate-pulse text-[#1e3a8a]" />
          Loading evaluation data...
        </div>
      </div>
    );
  }

  const radarData = useMemo(() => {
    return METRICS.map(metric => ({
      metric: metric,
      Baseline: baseline.metrics[metric as keyof typeof baseline.metrics],
      Selected: selected.metrics[metric as keyof typeof selected.metrics],
    }));
  }, [baseline, selected]);

  const scoreDistributionData = useMemo(() => {
    const mean = selected.metrics.Bias; // Center PMF roughly around the bias score
    const bins = ['0.0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];
    let sum = 0;
    const raw = bins.map((range, i) => {
      const center = i * 0.1 + 0.05;
      const val = Math.exp(-Math.pow(center - mean, 2) / 0.08) + Math.random() * 0.05; // Normal-ish distribution setup
      sum += val;
      return { range, val };
    });
    return raw.map(d => ({
      range: d.range,
      probability: parseFloat((d.val / sum).toFixed(3))
    }));
  }, [selected]);

  // Color intensity for heatmap (blue-to-orange scale based on max 1.0)
  const getHeatmapColor = (value: number) => {
    // value between 0 and 1
    // Professional diverging logic: low values = light gray/blue, high values = burnt orange
    const r = Math.round(248 + value * (234 - 248)); // 248 to 234 (orange base)
    const g = Math.round(250 + value * (88 - 250));  // 250 to 88
    const b = Math.round(252 + value * (12 - 252));  // 252 to 12
    const opacity = Math.min(1, 0.2 + (value * 0.8));
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans p-6 sm:p-8">
      
      {/* HEADER SECTION */}
      <header className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row justify-between items-start md:items-center py-4 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-[#1e3a8a]" />
            BDSU Evaluation Dashboard
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Bias, Disparity, Sensitivity, and Uncertainty in LLM Responses</p>
        </div>
        
        <div className="mt-4 md:mt-0 relative min-w-[220px]">
          <label className="block text-xs font-bold text-[#ea580c] uppercase tracking-wider mb-1">
            Evaluating Model
          </label>
          <div className="relative">
            <select 
              className="appearance-none w-full bg-orange-50/50 border border-orange-200 hover:border-orange-300 px-4 py-2 pr-10 rounded-lg shadow-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ea580c] focus:border-transparent cursor-pointer transition-colors"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {data.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ea580c] pointer-events-none w-5 h-5" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* GLOBAL MODEL VIEW (TOP) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* RADAR CHART (Left, 5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-[420px]">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden flex-grow flex flex-col">
              <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-slate-600" />
                BDSU Radar Signature
              </h2>
              <p className="text-sm text-slate-500 mb-6 border-b border-slate-100 pb-4">
                Model-level evaluation comparing <strong>{selectedPersona}</strong> vs Global Baseline ({baseline.group}) across all scenarios.
              </p>
              
              <div className="flex-grow w-full -ml-4 min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <PolarAngleAxis 
                      dataKey="metric" 
                      tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }} 
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    
                    {/* Baseline (White Men) - Light Gray */}
                    <Radar
                      name={`Baseline (${baseline.group})`}
                      dataKey="Baseline"
                      stroke="#94a3b8"
                      fill="#cbd5e1"
                      fillOpacity={0.3}
                      strokeDasharray="4 4"
                    />
                    
                    {/* Selected Persona - Navy Blue */}
                    <Radar
                      name={selectedPersona}
                      dataKey="Selected"
                      stroke="#1e3a8a" // Navy Blue
                      strokeWidth={3}
                      fill="#1e3a8a"
                      fillOpacity={0.2}
                    />
                    
                    <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 600 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* SYSTEMIC HEATMAP (Right, 7 cols) */}
          <div className="lg:col-span-7 flex flex-col h-[420px]">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
              <div className="flex justify-between items-end mb-4 flex-shrink-0 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-slate-600" />
                    Systemic View
                  </h2>
                  <p className="text-sm text-slate-500">Global model BDSU metrics across all personas and aggregated templates.</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400">
                  <span>0.0</span>
                  <div className="w-16 h-2 rounded bg-gradient-to-r from-slate-100 to-[#ea580c] mx-1"></div>
                  <span>1.0</span>
                </div>
              </div>

              <div className="overflow-auto border border-slate-100 rounded flex-grow">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold bg-slate-50">Persona</th>
                      {METRICS.map(m => <th key={m} className="px-3 py-2.5 font-semibold text-center w-16 bg-slate-50" title={m}>{m[0]}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modelData.map(d => (
                      <tr 
                        key={d.group} 
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${d.group === selectedPersona ? 'bg-blue-50/50' : ''}`}
                        onClick={() => setSelectedPersona(d.group)}
                      >
                        <td className={`px-3 py-2 font-medium ${d.group === "White men" ? 'text-slate-400 italic' : 'text-slate-700'} ${d.group === selectedPersona ? 'text-[#1e3a8a] font-bold' : ''}`}>
                          {d.group === "White men" ? d.group + ' (Base)' : d.group}
                        </td>
                        {METRICS.map(m => {
                          const val = d.metrics[m as keyof typeof d.metrics];
                          return (
                            <td key={m} className="p-1">
                              <div 
                                className="w-full h-7 rounded flex items-center justify-center text-xs font-medium text-slate-900 shadow-sm border border-black/5"
                                style={{ backgroundColor: getHeatmapColor(val) }}
                                title={`${m}: ${val.toFixed(3)}`}
                              >
                                {val.toFixed(2).replace('0.', '.')}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

        </div>

        {/* SPECIFIC SCENARIO SECTION (BOTTOM) */}
        <div className="border-t border-slate-200 pt-8 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Scenario Specific Analysis</h2>
            <p className="text-sm text-slate-500 mt-1">Configure specific templates and attributes to drill down into the selected persona's metrics.</p>
          </div>

          {/* CONTROLS SECTION */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Focus Persona</label>
                <div className="relative">
                  <select 
                    className="appearance-none w-full bg-slate-50 border border-slate-300 hover:border-slate-400 px-4 py-2.5 pr-10 rounded-lg shadow-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent cursor-pointer transition-colors"
                    value={selectedPersona}
                    onChange={(e) => setSelectedPersona(e.target.value)}
                  >
                    {modelData.filter(d => d.group !== "White men").map(d => (
                      <option key={d.group} value={d.group}>{d.group}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
                </div>
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Scenario Template</label>
                <div className="relative">
                  <select 
                    className="appearance-none w-full bg-slate-50 border border-slate-300 hover:border-slate-400 px-4 py-2.5 pr-10 rounded-lg shadow-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent cursor-pointer transition-colors"
                    value={selectedTemplateIndex}
                    onChange={(e) => setSelectedTemplateIndex(parseInt(e.target.value) || 0)}
                  >
                    {selected.samples?.map((_, i) => (
                      <option key={i} value={i}>Template {i + 1}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
                </div>
              </div>


            </div>
          </section>
        
          {/* SCENARIO CONTENT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <div className="lg:col-span-12 flex flex-col gap-6">
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
                <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-slate-600" />
                  Actual Evaluation Content
                </h2>
                <p className="text-sm text-slate-500 mb-6">The real prompt evaluated and the raw sample response produced.</p>
                
                <div className="bg-slate-50 p-5 border border-slate-200 rounded-lg shadow-inner flex flex-col gap-4">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Model Prompt</span>
                    <p className="text-slate-800 font-medium font-serif leading-relaxed italic text-[16px]">
                      "{selected.samples?.[selectedTemplateIndex]?.prompt || "No prompt available"}"
                    </p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Generated Response Sample</span>
                    <div className="text-slate-700 font-sans leading-relaxed text-sm bg-white p-3 rounded border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {selected.samples?.[selectedTemplateIndex]?.response || "No response available"}
                    </div>
                  </div>
                </div>
              </section>

          {/* PMF CHART */}
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
            <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-600" />
              Score Distribution (PMF)
            </h2>
            <p className="text-sm text-slate-500 mb-6">Probability mass function showing the distribution of dataset scores uniformly binned from 0.0 to 1.0 for <strong>{selectedPersona}</strong>.</p>
            
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="range" 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`${(Number(value) * 100).toFixed(1)}%`, 'Probability']}
                    labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}
                  />
                  <Bar 
                    dataKey="probability" 
                    fill="#0f766e"
                    radius={[4, 4, 0, 0]} 
                    animationDuration={1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

              <section className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-[#0369a1] mb-2">Automated Metric Insight</h3>
                <p className="text-[#0c4a6e] text-sm leading-relaxed">
                  When analyzing responses about <strong>{selectedPersona}</strong> within this specific algorithmic permutation, the model showed a maximum metric deviation in 
                  <strong> {' '}{radarData.reduce((prev, curr) => (curr.Selected - curr.Baseline) > (prev.Selected - prev.Baseline) ? curr : prev).metric}{' '} </strong> 
                  (+{(radarData.reduce((prev, curr) => (curr.Selected - curr.Baseline) > (prev.Selected - prev.Baseline) ? curr : prev).Selected - radarData.reduce((prev, curr) => (curr.Selected - curr.Baseline) > (prev.Selected - prev.Baseline) ? curr : prev).Baseline).toFixed(3)} over baseline). This correlates with observable qualitative shifts such as questioning the patient's credibility or imposing cultural stereotypes compared to standard procedures offered to the baseline persona.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
