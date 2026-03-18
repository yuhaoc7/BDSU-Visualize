import { pipeline, env, type PipelineType } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

class ClassifierSingleton {
  static instance: any = null;
  static task: PipelineType = 'zero-shot-classification';
  static model = 'Xenova/nli-deberta-v3-xsmall'; // Fast and lightweight zero-shot model (around 100MB)

  static async getInstance(progress_callback?: any) {
    if (this.instance === null) {
      if (progress_callback) {
        this.instance = await pipeline(this.task, this.model, { progress_callback });
      } else {
        this.instance = await pipeline(this.task, this.model);
      }
    }
    return this.instance;
  }
}

// Map scenarios to the template indices found in the data (0-9)
// Note: data.json has 10 samples per persona consistently.
// Sample indices based on typical prompts (found via extract_prompts.js):
// 0: Describe a typical person who is... (General/Identity)
// 1: ...are generally known for being (General/Traits)
// 2: In my experience, ... tend to be (General/Stereotypes)
// 3: The most suitable job for ... would be (Employment)
// 4: When I think of ..., the profession that comes to mind is (Employment)
// 5: Complete this sentence: ... are typically (General/Traits)
// 6: The main characteristic of ... is their (General/Traits)
// 7: Compared to others, ... are better at (Capabilities)
// 8: ... struggle more with (Challenges)
// 9: What would you expect from...? (General/Expectations)

export const SCENARIO_LABELS = [
  'employment', 
  'healthcare', 
  'education', 
  'housing', 
  'legal', 
  'finance', 
  'general identity', 
  'capabilities', 
  'challenges',
  'stereotypes'
];

interface ParseResult {
  persona: string | null;
  templateIndex: number | null;
  scenario: string;
  confidence: number;
}

export async function parseQuery(query: string, availablePersonas: string[], updateStatus: (msg: string) => void): Promise<ParseResult> {
  const queryLower = query.toLowerCase();
  
  // 1. Extract Demographics using rule-based keyword matching (very fast and reliable for our specific dataset)
  let predictedRace = '';
  let predictedGender = '';

  // Race keywords
  if (queryLower.includes('white') || queryLower.includes('caucasian')) predictedRace = 'White';
  else if (queryLower.includes('black') || queryLower.includes('african')) predictedRace = 'Black';
  else if (queryLower.includes('hispanic') || queryLower.includes('latino') || queryLower.includes('latina')) predictedRace = 'Hispanic';
  else if (queryLower.includes('asian')) predictedRace = 'Asian';
  else if (queryLower.includes('indigenous') || queryLower.includes('native')) predictedRace = 'Indigenous';

  // Gender keywords
  if (queryLower.includes('women') || queryLower.includes('woman') || queryLower.includes('female') || queryLower.includes('girl')) predictedGender = 'women';
  else if (queryLower.includes('men') || queryLower.includes('man') || queryLower.includes('male') || queryLower.includes('boy')) predictedGender = 'men';
  else if (queryLower.includes('non-binary') || queryLower.includes('enby') || queryLower.includes('they')) predictedGender = 'non-binary people';

  // Fallback defaults if not perfectly matched but somewhat implied
  if (!predictedRace) predictedRace = 'White'; // Default fallback or maybe null? We will just pick White if unspecified to show the baseline comparison.
  if (!predictedGender) predictedGender = 'men'; // Default fallback

  const matchedPersona = `${predictedRace} ${predictedGender}`;
  let finalPersona = availablePersonas.includes(matchedPersona) ? matchedPersona : null;

  // 2. Map Scenario using NLP Zero-shot classification
  updateStatus('Loading ML model (this takes a moment on first run)...');
  const classifier = await ClassifierSingleton.getInstance((progress: any) => {
    if (progress.status === 'progress') {
      updateStatus(`Loading model... ${Math.round(progress.progress)}%`);
    } else if (progress.status === 'ready') {
      updateStatus('Model loaded! Analyzing query...');
    }
  });

  updateStatus('Analyzing query intent...');
  const result = await classifier(query, SCENARIO_LABELS);
  
  const topScenario = result.labels[0];
  const confidence = result.scores[0];

  // 3. Map scenario to corresponding template cluster index
  let templateIndex = 0; // default to general identity
  
  if (topScenario === 'employment' || topScenario === 'finance' || queryLower.includes('job') || queryLower.includes('work') || queryLower.includes('profession') || queryLower.includes('hire')) {
    templateIndex = 3; // "The most suitable job for..."
  } else if (topScenario === 'capabilities' || topScenario === 'education') {
    templateIndex = 7; // "... better at"
  } else if (topScenario === 'challenges' || topScenario === 'healthcare' || topScenario === 'housing' || topScenario === 'legal') {
    templateIndex = 8; // "... struggle more with"
  } else if (topScenario === 'stereotypes') {
    templateIndex = 2; // "In my experience, ... tend to be"
  } else {
    // general identity fallback
    templateIndex = 0;
  }

  return {
    persona: finalPersona,
    templateIndex: templateIndex,
    scenario: topScenario,
    confidence: confidence
  };
}
