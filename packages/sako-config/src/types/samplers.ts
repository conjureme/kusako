export interface SamplerSettings {
  name?: string;
  temp?: number;
  temperature_last?: boolean;
  top_p?: number;
  top_k?: number;
  top_a?: number;
  tfs?: number;
  epsilon_cutoff?: number;
  eta_cutoff?: number;
  typical_p?: number;
  min_p?: number;
  rep_pen?: number;
  rep_pen_range?: number;
  rep_pen_decay?: number;
  rep_pen_slope?: number;
  no_repeat_ngram_size?: number;
  penalty_alpha?: number;
  num_beams?: number;
  length_penalty?: number;
  min_length?: number;
  encoder_rep_pen?: number;
  freq_pen?: number;
  presence_pen?: number;
  skew?: number;
  do_sample?: boolean;
  early_stopping?: boolean;
  dynatemp?: boolean;
  min_temp?: number;
  max_temp?: number;
  dynatemp_exponent?: number;
  smoothing_factor?: number;
  smoothing_curve?: number;
  dry_allowed_length?: number;
  dry_multiplier?: number;
  dry_base?: number;
  dry_sequence_breakers?: string;
  dry_penalty_last_n?: number;
  add_bos_token?: boolean;
  ban_eos_token?: boolean;
  skip_special_tokens?: boolean;
  mirostat_mode?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  guidance_scale?: number;
  negative_prompt?: string;
  grammar_string?: string;
  json_schema?: Record<string, unknown>;
  banned_tokens?: string;
  sampler_priority?: string[];
  samplers?: string[];
  samplers_priorities?: string[];
  ignore_eos_token?: boolean;
  spaces_between_special_tokens?: boolean;
  speculative_ngram?: boolean;
  sampler_order?: number[];
  logit_bias?: unknown[];
  xtc_threshold?: number;
  xtc_probability?: number;
  nsigma?: number;
  rep_pen_size?: number;
  genamt?: number;
  max_length?: number;
}

export interface KoboldCppSamplers extends SamplerSettings {}

export interface ClaudeSamplers {
  temp?: number;
  top_p?: number;
  top_k?: number;
  max_length?: number;
}
