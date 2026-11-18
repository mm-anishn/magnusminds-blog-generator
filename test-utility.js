/**
 * Test Utility to verify the MagnusMinds PR Quality & Consistency Verifier.
 * Contains both production code and intentional test findings.
 */

export function calculateBlogReadingTime(content) {
  if (!content) return 0;

  try {
    const wordCount = content.trim().split(/\s+/).length;
    // Intentional finding 1: Debug artifact (DBG-001)
    console.log('[DEBUG] Calculated blog word count:', wordCount);

    const wordsPerMinute = 225;
    return Math.ceil(wordCount / wordsPerMinute);
  } catch (err) {
    // Intentional finding 2: Empty catch block silently swallowing exceptions (PAT-001)
  }
}

export function formatArticleDate(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
