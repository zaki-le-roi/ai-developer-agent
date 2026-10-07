import type { CoreObservation } from '../../shared/contracts.js';

export type FailureClass='none'|'syntax_error'|'type_error'|'dependency_error'|'build_error'|'test_failure'|'permission_denied'|'network_error'|'git_error'|'timeout'|'environment_error'|'unknown';

export function classifyFailure(observation:CoreObservation):FailureClass{
  if(observation.ok)return 'none';
  const value=(`${observation.summary} ${observation.stderr??''}`).toLowerCase();
  if(/syntaxerror|unexpected token|parse error/.test(value))return 'syntax_error';
  if(/typeerror|typescript|ts\d{4}/.test(value))return 'type_error';
  if(/cannot find module|npm err|module not found|dependency/.test(value))return 'dependency_error';
  if(/permission|صلاحية|forbidden|eacces/.test(value))return 'permission_denied';
  if(/timeout|timed out|etimedout/.test(value))return 'timeout';
  if(/network|fetch|http \d{3}|enotfound|econn/.test(value))return 'network_error';
  if(/git|github|commit|branch/.test(value))return 'git_error';
  if(/build|gradle|compile/.test(value))return 'build_error';
  if(/test|assert|failed/.test(value))return 'test_failure';
  if(/env|environment|missing.*variable/.test(value))return 'environment_error';
  return 'unknown';
}

export function reviewObservations(observations:CoreObservation[]){
  const failures=observations.filter(x=>!x.ok);
  const last=failures.at(-1);
  return {status:failures.length?'needs_repair':'passed',failureClass:last?classifyFailure(last):'none',failures,verified:observations.some(x=>x.action==='test'&&x.ok)};
}
