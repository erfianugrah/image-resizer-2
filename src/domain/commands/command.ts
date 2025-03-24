/**
 * Command pattern interfaces
 */

/**
 * Base command interface for all commands
 */
export interface Command<T> {
  /**
   * Execute the command
   * 
   * @returns Promise resolving to the command result
   */
  execute(): Promise<T>;
}