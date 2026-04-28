// NxtStepOS Analytics API — returns counts and trends for the dashboard
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB = () => ({
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [leadsRes, clientsRes, remindersRes, sequencesRes, emailsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/leads?select=created_at,status`, { headers: SB() }),
      fetch(`${SUPABASE_URL}/rest/v1/clients?select=created_at,status,renewal_date`, { headers: SB() }),
      fetch(`${SUPABASE_URL}/rest/v1/renewal_reminders?select=sent_at,days_before`, { headers: SB() }),
      fetch(`${SUPABASE_URL}/rest/v1/lead_sequences?select=created_at,status`, { headers: SB() }),
      fetch(`${SUPABASE_URL}/rest/v1/emails?select=created_at,ai_classification,status`, { headers: SB() }),
    ]);

    const [leads, clients, reminders, sequences, emails] = await Promise.all([
      leadsRes.json(), clientsRes.json(), remindersRes.json(), sequencesRes.json(), emailsRes.json(),
    ]);

    // Leads per month (last 6 months)
    const leadsPerMonth = getLast6Months().map(({ label, start, end }) => ({
      label,
      count: (leads || []).filter(l => l.created_at >= start && l.created_at < end).length,
    }));

    // Clients per month (last 6 months)
    const clientsPerMonth = getLast6Months().map(({ label, start, end }) => ({
      label,
      count: (clients || []).filter(c => c.created_at >= start && c.created_at < end).length,
    }));

    // Renewal reminders breakdown
    const remindersByMilestone = {
      90: (reminders || []).filter(r => r.days_before === 90).length,
      60: (reminders || []).filter(r => r.days_before === 60).length,
      30: (reminders || []).filter(r => r.days_before === 30).length,
    };

    // Sequence stats
    const seqActive    = (sequences || []).filter(s => s.status === 'active').length;
    const seqCompleted = (sequences || []).filter(s => s.status === 'completed').length;

    // Email classification breakdown
    const emailStats = {
      needs_attention: (emails || []).filter(e => e.ai_classification === 'needs_attention').length,
      auto_handle:     (emails || []).filter(e => e.ai_classification === 'auto_handle').length,
      no_reply:        (emails || []).filter(e => e.ai_classification === 'no_reply').length,
      sent:            (emails || []).filter(e => e.status === 'sent').length,
    };

    // Upcoming renewals
    const now   = new Date(); now.setHours(0,0,0,0);
    const in90  = new Date(now); in90.setDate(now.getDate() + 90);
    const upcomingRenewals = (clients || []).filter(c => {
      if (!c.renewal_date) return false;
      const d = new Date(c.renewal_date);
      return d >= now && d <= in90;
    }).length;

    return res.status(200).json({
      totals: {
        leads:    (leads  || []).length,
        clients:  (clients|| []).length,
        active_clients: (clients || []).filter(c => c.status === 'active').length,
        reminders_sent: (reminders || []).length,
        upcoming_renewals: upcomingRenewals,
        emails_handled: (emails || []).length,
      },
      leadsPerMonth,
      clientsPerMonth,
      remindersByMilestone,
      seqActive,
      seqCompleted,
      emailStats,
    });

  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function getLast6Months() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const start = new Date(d);
    const end   = new Date(d);
    end.setMonth(end.getMonth() + 1);
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      start: start.toISOString(),
      end:   end.toISOString(),
    });
  }
  return months;
}
