import { useState, useMemo, useEffect } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { ShieldAlert, BookOpen, Activity, AlertCircle, ChevronDown, BarChart3, LineChart as LineChartIcon, Search, Sparkles, Loader2, Info } from 'lucide-react';
import { parseQuery, SCENARIO_LABELS } from './nlu';

// --- TYPES ---
const METRICS = ['Bias', 'Disparity', 'Sensitivity', 'Uncertainty'];

type PersonaMetrics = { Bias: number, Disparity: number, Sensitivity: number, Uncertainty: number };
type PersonaResponse = { text: string, score: number | null };
type PersonaSample = { prompt: string, responses: PersonaResponse[] };
type PersonaData = { group: string, metrics: PersonaMetrics, samples: PersonaSample[] };
type ModelData = { name: string, personas: PersonaData[] };

export default function Dashboard() {
  const [data, setData] = useState<ModelData[] | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string>("Black women");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(0);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedResponse, setSelectedResponse] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'scenario'>('overview');

  // NLU States
  const [nlpQuery, setNlpQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [nluStatus, setNluStatus] = useState("");
  const [lastParsedScenario, setLastParsedScenario] = useState<{scenario: string, attributes: string, confidence: number} | null>(null);

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

  // All available groups except baseline
  const availableGroups = useMemo(() => {
    return modelData.map(d => d.group).filter(g => g !== "White men");
  }, [modelData]);

  const handleAnalyzeQuery = async () => {
    if (!nlpQuery.trim()) return;
    setIsAnalyzing(true);
    setNluStatus("Extracting intent...");
    
    try {
      const result = await parseQuery(nlpQuery, availableGroups, (msg) => setNluStatus(msg));
      
      if (result.persona) {
        setSelectedPersona(result.persona);
      }
      if (result.templateIndex !== null) {
        setSelectedTemplateIndex(result.templateIndex);
        setSelectedResponse(0); // reset response when changing template
      }

      setLastParsedScenario({
        scenario: result.scenario,
        attributes: result.persona || "Default / Unspecified",
        confidence: result.confidence
      });
      setNluStatus("");
    } catch (error) {
      console.error(error);
      setNluStatus("Error classifying query.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePMFBarClick = (data: any) => {
    if (!selected || !data || !data.range) return;
    const rangeStr = data.range as string;
    
    const matchingCandidates: { templateIndex: number, responseIndex: number }[] = [];
    selected.samples?.forEach((sample, tIdx) => {
      sample.responses?.forEach((r, rIdx) => {
        if (r.score != null) {
          let binIdx = Math.floor(r.score * 10);
          if (binIdx >= 10) binIdx = 9;
          if (binIdx < 0) binIdx = 0;
          
          const expectedBinRange = [
            '0.0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', 
            '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'
          ][binIdx];

          if (expectedBinRange === rangeStr) {
            matchingCandidates.push({ templateIndex: tIdx, responseIndex: rIdx });
          }
        }
      });
    });

    if (matchingCandidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * matchingCandidates.length);
      const chosen = matchingCandidates[randomIndex];
      setSelectedTemplateIndex(chosen.templateIndex);
      setSelectedResponse(chosen.responseIndex);
    }
  };

  const baseline = modelData.length > 0 ? modelData[0] : null; // Usually "White men"
  const selected = useMemo(() => {
    return modelData.find(d => d.group === selectedPersona) || (modelData.length > 1 ? modelData[1] : baseline);
  }, [modelData, selectedPersona, baseline]);

  const radarData = useMemo(() => {
    if (!baseline || !selected) return [];
    return METRICS.map(metric => ({
      metric: metric,
      Baseline: baseline.metrics[metric as keyof typeof baseline.metrics],
      Selected: selected.metrics[metric as keyof typeof selected.metrics],
    }));
  }, [baseline, selected]);

  const scoreDistributionData = useMemo(() => {
    if (!selected) return [];
    // Collect all non-null scores from every response across all templates
    const allScores: number[] = [];
    for (const sample of (selected.samples || [])) {
      for (const r of (sample.responses || [])) {
        if (r.score != null) allScores.push(r.score);
      }
    }
    if (allScores.length === 0) return [];
    const bins = ['0.0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];
    const counts = new Array(10).fill(0);
    allScores.forEach((s: number) => {
      let binIdx = Math.floor(s * 10);
      if (binIdx >= 10) binIdx = 9;
      if (binIdx < 0) binIdx = 0;
      counts[binIdx]++;
    });
    return bins.map((range, i) => ({
      range,
      probability: parseFloat((counts[i] / allScores.length).toFixed(3))
    }));
  }, [selected]);

  const maxMetricValue = useMemo(() => {
    if (!modelData || modelData.length === 0) return 1.0;
    let max = 0;
    modelData.forEach(d => {
      ['Bias', 'Sensitivity', 'Uncertainty'].forEach(m => {
        const val = d.metrics[m as keyof typeof d.metrics] || 0;
        if (val > max) max = val;
      });
    });
    return max > 0 ? max : 1.0;
  }, [modelData]);
  
  // Compute Parallel Coordinates Data for all models
  const parallelCoordinatesData = useMemo(() => {
    if (!data) return [];
    
    // First, average the metrics for each model
    const modelAverages = data.map((model, idx) => {
      let biasSum = 0, disparitySum = 0, sensitivitySum = 0, uncertaintySum = 0;
      let count = model.personas.length || 1;
      
      model.personas.forEach(p => {
        biasSum += p.metrics.Bias || 0;
        disparitySum += p.metrics.Disparity || 0;
        sensitivitySum += p.metrics.Sensitivity || 0;
        uncertaintySum += p.metrics.Uncertainty || 0;
      });

      return {
        keyId: `model_${idx}`,
        modelName: model.name,
        Bias: biasSum / count,
        Disparity: disparitySum / count,
        Sensitivity: sensitivitySum / count,
        Uncertainty: uncertaintySum / count
      };
    });

    // Then format it so the X-axis is the 'metric' type
    return METRICS.map(metric => {
      const row: any = { metric };
      modelAverages.forEach(m => {
        row[m.keyId] = m[metric as keyof typeof m];
      });
      return row;
    });
  }, [data]);

  // Color intensity for heatmap (dynamically scaled)
  const getHeatmapColor = (value: number, maxVal: number) => {
    const normalized = Math.min(1, value / maxVal);
    const r = Math.round(248 + normalized * (234 - 248)); // 248 to 234 (orange base)
    const g = Math.round(250 + normalized * (88 - 250));  // 250 to 88
    const b = Math.round(252 + normalized * (12 - 252));  // 252 to 12
    const opacity = Math.min(1, 0.2 + (normalized * 0.8));
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans p-6 sm:p-8">
      
      {/* HEADER SECTION */}
      <header className="max-w-7xl mx-auto mb-6 pt-2 border-b border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6">
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
        </div>

        {/* NAV BAR */}
        <nav className="flex space-x-8 mt-2 -mb-px">
          <button 
            className={`pb-3 px-2 border-b-2 font-bold text-sm transition-colors ${activeTab === 'overview' ? 'border-[#1e3a8a] text-[#1e3a8a]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            onClick={() => setActiveTab('overview')}
          >
            System Overview
          </button>
          <button 
            className={`pb-3 px-2 border-b-2 font-bold text-sm transition-colors ${activeTab === 'comparison' ? 'border-[#1e3a8a] text-[#1e3a8a]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            onClick={() => setActiveTab('comparison')}
          >
            Multimodal Comparison
          </button>
          <button 
            className={`pb-3 px-2 border-b-2 font-bold text-sm transition-colors ${activeTab === 'scenario' ? 'border-[#1e3a8a] text-[#1e3a8a]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            onClick={() => setActiveTab('scenario')}
          >
            Scenario Specific Analysis
          </button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-[500px]">
            
            {/* RADAR CHART (Left, 5 cols) */}
            <div className="lg:col-span-5 flex flex-col">
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden flex-grow flex flex-col">
                <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-slate-600" />
                  BDSU Radar Signature
                </h2>
                <p className="text-sm text-slate-500 mb-6 border-b border-slate-100 pb-4">
                  Evaluating <strong>{selectedPersona}</strong> vs Baseline ({baseline.group}).
                </p>
                
                <div className="flex-grow w-full min-h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <PolarAngleAxis 
                        dataKey="metric" 
                        tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }} 
                      />
                      <PolarRadiusAxis angle={30} domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      
                      {/* Baseline */}
                      <Radar
                        name={`Baseline (${baseline.group})`}
                        dataKey="Baseline"
                        stroke="#94a3b8"
                        fill="#cbd5e1"
                        fillOpacity={0.3}
                        strokeDasharray="4 4"
                      />
                      
                      {/* Selected */}
                      <Radar
                        name={selectedPersona}
                        dataKey="Selected"
                        stroke="#1e3a8a"
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

            {/* HEATMAP (Right, 7 cols) */}
            <div className="lg:col-span-7 flex flex-col">
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full w-full">
                <div className="flex justify-between items-end mb-4 flex-shrink-0 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-slate-600" />
                      Systemic View
                    </h2>
                    <p className="text-sm text-slate-500">Global model metrics across personas for <strong>{selectedModel}</strong>.</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400">
                    <span>0.0</span>
                    <div className="w-16 h-2 rounded bg-gradient-to-r from-slate-100 to-[#ea580c] mx-1"></div>
                    <span>{maxMetricValue.toFixed(2)}</span>
                  </div>
                </div>

                <div className="overflow-auto border border-slate-100 rounded flex-grow max-h-[420px]">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 font-semibold bg-slate-50 rounded-tl">Persona</th>
                        {['Bias', 'Sensitivity', 'Uncertainty'].map(m => <th key={m} className="px-4 py-3 font-semibold text-center w-24 bg-slate-50">{m}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modelData.map(d => (
                        <tr 
                          key={d.group} 
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${d.group === selectedPersona ? 'bg-blue-50/50' : ''}`}
                          onClick={() => setSelectedPersona(d.group)}
                        >
                          <td className={`px-4 py-3 font-medium ${d.group === "White men" ? 'text-slate-400 italic' : 'text-slate-700'} ${d.group === selectedPersona ? 'text-[#1e3a8a] font-bold' : ''}`}>
                            {d.group === "White men" ? d.group + ' (Base)' : d.group}
                          </td>
                          {['Bias', 'Sensitivity', 'Uncertainty'].map(m => {
                            const val = d.metrics[m as keyof typeof d.metrics];
                            return (
                              <td key={m} className="p-2">
                                <div 
                                  className="w-full h-8 rounded flex items-center justify-center text-xs font-medium text-slate-900 shadow-sm border border-black/5"
                                  style={{ backgroundColor: getHeatmapColor(val, maxMetricValue) }}
                                >
                                  {val.toFixed(3)}
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
        )}

        {/* COMPARISON TAB */}
        {activeTab === 'comparison' && (
          <div className="flex flex-col min-h-[500px]">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden flex-grow flex flex-col">
              <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                <LineChartIcon className="w-6 h-6 text-slate-600" />
                Multimodal Comparison (Parallel Coordinates)
              </h2>
              <p className="text-sm text-slate-500 mb-6 border-b border-slate-100 pb-4">
                Comparing average BDSU metric scores across all models. <strong>{selectedModel}</strong> is highlighted.
              </p>
              
              <div className="w-full mt-4">
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={parallelCoordinatesData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="metric" 
                      tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }} 
                      padding={{ left: 50, right: 50 }}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 11 }} 
                      domain={['dataMin', 'dataMax']} 
                      tickFormatter={(val) => typeof val === 'number' ? val.toFixed(4) : val}
                      label={{ value: 'Average Score', angle: -90, position: 'insideLeft', fill: '#64748b', offset: -10 }}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold' }}
                      formatter={(value: any, name: any) => [typeof value === 'number' ? value.toFixed(5) : value, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {data.map((model, idx) => (
                      <Line
                        key={model.name}
                        name={model.name}
                        type="linear"
                        dataKey={`model_${idx}`}
                        stroke={model.name === selectedModel ? '#ea580c' : '#cbd5e1'}
                        strokeWidth={model.name === selectedModel ? 4 : 2}
                        dot={model.name === selectedModel ? { r: 6, fill: '#ea580c' } : { r: 3, fill: '#cbd5e1' }}
                        activeDot={{ r: 8 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </section>
          </div>
        )}

        {/* SCENARIO TAB */}
        {activeTab === 'scenario' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Search className="w-5 h-5 text-slate-600" />
                  Natural Language Query
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Type a query (e.g., "looking for a job", "Black patient needing treatment") to auto-map scenario, attributes, and templates.
                </p>
              </div>
            </div>

            {/* QUERY INPUT SECTION */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="e.g. Hispanic man applying for a position..."
                    className="w-full bg-slate-50 border border-slate-300 hover:border-[#1e3a8a]/40 focus:border-[#1e3a8a] focus:ring-2 focus:ring-[#1e3a8a]/20 rounded-lg pl-4 pr-32 py-3 text-slate-800 font-medium transition-all shadow-sm focus:outline-none"
                    value={nlpQuery}
                    onChange={(e) => setNlpQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyzeQuery(); }}
                  />
                  <button 
                    onClick={handleAnalyzeQuery}
                    disabled={isAnalyzing || !nlpQuery.trim()}
                    className="absolute right-2 px-4 py-1.5 bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white text-sm font-bold rounded-md disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </button>
                </div>
                {nluStatus && (
                  <div className="text-xs font-medium text-slate-500 flex items-center gap-2 px-1">
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    {nluStatus}
                  </div>
                )}
                {lastParsedScenario && (
                   <div className="bg-blue-50/50 border border-blue-100 rounded-md p-3 flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-slate-500">ML Scenario Cluster</span>
                        <span className="font-semibold text-[#1e3a8a] capitalize">{lastParsedScenario.scenario} <span className="text-slate-400 font-normal text-xs ml-1">({(lastParsedScenario.confidence * 100).toFixed(1)}%)</span></span>
                      </div>
                      <div className="flex flex-col border-l border-blue-200 pl-6">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Extracted Attributes</span>
                        <span className="font-semibold text-teal-700">{lastParsedScenario.attributes}</span>
                      </div>
                   </div>
                )}
              </div>
            </section>

            {/* CONTROLS SECTION */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cluster</label>
                  <div className="relative">
                    <select
                      className="appearance-none w-full bg-slate-50 border border-slate-300 hover:border-slate-400 px-4 py-2.5 pr-10 rounded-lg shadow-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent cursor-pointer transition-colors"
                      value={selectedTemplateIndex}
                      onChange={(e) => { setSelectedTemplateIndex(parseInt(e.target.value) || 0); setSelectedResponse(0); }}
                    >
                      {selected.samples?.map((_, i) => {
                        const label = SCENARIO_LABELS[i];
                        const displayName = label ? label.charAt(0).toUpperCase() + label.slice(1) : `Cluster ${i + 1}`;
                        return <option key={i} value={i}>{displayName}</option>;
                      })}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Template</label>
                  <div className="relative">
                    <select
                      className="appearance-none w-full bg-slate-50 border border-slate-300 hover:border-slate-400 px-4 py-2.5 pr-10 rounded-lg shadow-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent cursor-pointer transition-colors"
                      value={selectedResponse}
                      onChange={(e) => setSelectedResponse(parseInt(e.target.value) || 0)}
                    >
                      {(selected.samples?.[selectedTemplateIndex]?.responses || []).map((r, i) => (
                        <option key={i} value={i}>
                          Template {i + 1}{r.score != null ? ` (score: ${r.score.toFixed(3)})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none w-5 h-5" />
                  </div>
                </div>
              </div>
            </section>
          
            {/* SCENARIO CONTENT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Generated Response</span>
                      {(() => {
                        const r = selected.samples?.[selectedTemplateIndex]?.responses?.[selectedResponse];
                        return r?.score != null ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            Score: {r.score.toFixed(4)}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="text-slate-700 font-sans leading-relaxed text-sm bg-white p-3 rounded border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {selected.samples?.[selectedTemplateIndex]?.responses?.[selectedResponse]?.text || "No response available"}
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col gap-6">
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
                          onClick={handlePMFBarClick}
                          cursor="pointer"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}
