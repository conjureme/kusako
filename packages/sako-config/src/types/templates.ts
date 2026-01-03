export interface ContextTemplate {
  story_string: string;
  example_separator: string;
  chat_start: string;
  use_stop_strings: boolean;
  allow_jailbreak: boolean;
  names_as_stop_strings: boolean;
  always_force_name2: boolean;
  trim_sentences: boolean;
  single_line: boolean;
  name: string;
}

export interface InstructTemplate {
  input_sequence: string;
  output_sequence: string;
  last_output_sequence: string;
  system_sequence: string;
  stop_sequence: string;
  wrap: boolean;
  macro: boolean;
  names_behavior: string;
  activation_regex: string;
  system_sequence_prefix: string;
  system_sequence_suffix: string;
  first_output_sequence: string;
  skip_examples: boolean;
  output_suffix: string;
  input_suffix: string;
  system_suffix: string;
  user_alignment_message: string;
  system_same_as_user: boolean;
  last_system_sequence: string;
  first_input_sequence: string;
  last_input_sequence: string;
  names_force_groups: boolean;
  name: string;
}

export interface SystemPrompt {
  name: string;
  content: string;
}

export interface Templates {
  context?: ContextTemplate;
  instruct?: InstructTemplate;
  system?: SystemPrompt;
}
