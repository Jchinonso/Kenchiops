#!/usr/bin/env tsx
/**
 * Code Duplication Detection Script
 * 
 * Checks for duplicate code patterns that should be in the shared package.
 * 
 * Usage:
 *   npm run check:duplication
 *   tsx scripts/check-duplication.ts
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

interface DuplicationIssue {
  file: string;
  line: number;
  pattern: string;
  message: string;
}

const DUPLICATION_PATTERNS = [
  {
    // Only flag if someone DEFINES their own createLogger function (not imports/uses it)
    pattern: /function\s+createLogger\s*\(|const\s+createLogger\s*=\s*\(/,
    message: 'Local createLogger definition - use createLogger from @kenchi/shared',
    exclude: ['packages/shared'],
  },
  {
    // Flag hand-rolled logger objects (not using createLogger)
    pattern: /const\s+logger\s*=\s*\{\s*(info|error|warn|debug)\s*:/,
    message: 'Hand-rolled logger object - use createLogger from @kenchi/shared',
    exclude: ['packages/shared'],
  },
  {
    pattern: /interface\s+(Config|WebhookEvent|LLMAnalysisResult|CIFailureEvent|SlackMessageEvent|GitHubPREvent)/,
    message: 'Duplicate type definition - use types from @kenchi/shared',
    exclude: ['packages/shared'],
  },
  {
    pattern: /class\s+(AppError|ValidationError|AuthenticationError|NotFoundError|ExternalServiceError|LLMError)/,
    message: 'Duplicate error class - use errors from @kenchi/shared',
    exclude: ['packages/shared'],
  },
  {
    pattern: /from\s+['"]\.\/utils\//,
    message: 'Importing from local utils - use @kenchi/shared instead',
    exclude: ['packages/shared'],
  },
  {
    pattern: /from\s+['"]\.\/helpers\//,
    message: 'Importing from local helpers - use @kenchi/shared instead',
    exclude: ['packages/shared'],
  },
  {
    pattern: /from\s+['"]\.\/lib\//,
    message: 'Importing from local lib - use @kenchi/shared instead',
    exclude: ['packages/shared'],
  },
  {
    pattern: /const\s+validate\s*=\s*\(/,
    message: 'Local validation function - use validate from @kenchi/shared',
    exclude: ['packages/shared'],
  },
  {
    pattern: /const\s+errorHandler\s*=\s*\(/,
    message: 'Local error handler - use errorHandler from @kenchi/shared',
    exclude: ['packages/shared'],
  },
];

const EXCLUDE_DIRS = ['node_modules', 'dist', 'coverage', '.git'];
const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

async function getAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const statResult = await stat(fullPath);
      
      if (statResult.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry)) {
          files.push(...await getAllFiles(fullPath, baseDir));
        }
      } else if (statResult.isFile()) {
        const ext = extname(entry);
        if (INCLUDE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
  
  return files;
}

function shouldCheckFile(file: string, pattern: { exclude?: string[] }): boolean {
  if (!pattern.exclude) return true;
  
  for (const exclude of pattern.exclude) {
    if (file.includes(exclude)) {
      return false;
    }
  }
  
  return true;
}

async function checkFile(file: string, patterns: typeof DUPLICATION_PATTERNS): Promise<DuplicationIssue[]> {
  const issues: DuplicationIssue[] = [];
  
  try {
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');
    
    for (const pattern of patterns) {
      if (!shouldCheckFile(file, pattern)) continue;
      
      lines.forEach((line, index) => {
        if (pattern.pattern.test(line)) {
          // Skip if it's importing from @kenchi/shared
          if (line.includes('@kenchi/shared')) return;
          
          issues.push({
            file,
            line: index + 1,
            pattern: line.trim(),
            message: pattern.message,
          });
        }
      });
    }
  } catch (error) {
    console.error(`Error reading file ${file}:`, error);
  }
  
  return issues;
}

async function main() {
  console.log('🔍 Checking for code duplication...\n');
  
  const rootDir = join(process.cwd());
  const servicesDir = join(rootDir, 'services');
  const packagesDir = join(rootDir, 'packages');
  
  const allFiles: string[] = [];
  
  // Check services directory
  try {
    const servicesFiles = await getAllFiles(servicesDir);
    allFiles.push(...servicesFiles);
  } catch (error) {
    console.warn('Warning: Could not read services directory');
  }
  
  // Check packages directory (excluding shared, as it's the source)
  try {
    const packagesFiles = await getAllFiles(packagesDir);
    // Filter out shared package
    const filtered = packagesFiles.filter(f => !f.includes('packages/shared/src'));
    allFiles.push(...filtered);
  } catch (error) {
    console.warn('Warning: Could not read packages directory');
  }
  
  console.log(`📁 Checking ${allFiles.length} files...\n`);
  
  const allIssues: DuplicationIssue[] = [];
  
  for (const file of allFiles) {
    const issues = await checkFile(file, DUPLICATION_PATTERNS);
    allIssues.push(...issues);
  }
  
  if (allIssues.length === 0) {
    console.log('✅ No duplication issues found!\n');
    console.log('All code is properly using @kenchi/shared package.');
    process.exit(0);
  }
  
  console.log(`❌ Found ${allIssues.length} potential duplication issue(s):\n`);
  
  // Group by file
  const issuesByFile = new Map<string, DuplicationIssue[]>();
  allIssues.forEach(issue => {
    const relativePath = issue.file.replace(rootDir + '/', '');
    if (!issuesByFile.has(relativePath)) {
      issuesByFile.set(relativePath, []);
    }
    issuesByFile.get(relativePath)!.push(issue);
  });
  
  // Print issues
  issuesByFile.forEach((issues, file) => {
    console.log(`📄 ${file}`);
    issues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.message}`);
      console.log(`   ${issue.pattern}`);
    });
    console.log('');
  });
  
  console.log('\n💡 Recommendations:');
  console.log('   1. Check if functionality exists in packages/shared/src/index.ts');
  console.log('   2. Import from @kenchi/shared instead of creating local versions');
  console.log('   3. If new shared functionality is needed, add to packages/shared/ first');
  console.log('   4. Update packages/shared/src/index.ts to export new functionality\n');
  
  process.exit(1);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

