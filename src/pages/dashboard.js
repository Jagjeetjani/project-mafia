/**
 * Dashboard Page — Overview with charts and key metrics
 */
import { getDashboardStats, getAll } from '../db.js';
import { formatCurrency, formatCurrencyCompact, timeAgo, normalizeStatus, getStatusLabel } from '../utils.js';
import Chart from 'chart.js/auto';

let revenueChart = null;
let statusChart = null;
let profitChart = null;

export function renderDashboard() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Overview of your business performance</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-secondary" id="btn-refresh-dashboard">
          <span class="material-icons-round">refresh</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" id="dashboard-stats">
      <!-- Will be populated dynamically -->
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Revenue & Profit Overview</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="chart-revenue"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Project Status Distribution</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="chart-status"></canvas>
        </div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Monthly Profit Trend</h3>
        </div>
        <div class="chart-wrapper">
          <canvas id="chart-profit"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Recent Activity</h3>
        </div>
        <div class="activity-list" id="recent-activity">
          <!-- Activity items -->
        </div>
      </div>
    </div>
  `;
}

export async function initDashboard() {
  const stats = await getDashboardStats();

  // Render stats cards
  const statsGrid = document.getElementById('dashboard-stats');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon purple">
          <span class="material-icons-round">inventory_2</span>
        </div>
      </div>
      <div class="stat-card-label">Total Orders</div>
      <div class="stat-card-value">${stats.projectStats.totalOrders + stats.materialStats.totalOrders}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon green">
          <span class="material-icons-round">account_balance_wallet</span>
        </div>
      </div>
      <div class="stat-card-label">Total Revenue</div>
      <div class="stat-card-value">${formatCurrencyCompact(stats.combinedRevenue)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon blue">
          <span class="material-icons-round">trending_up</span>
        </div>
      </div>
      <div class="stat-card-label">Total Profit</div>
      <div class="stat-card-value" style="color: var(--text-success)">${formatCurrencyCompact(stats.combinedProfit)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon orange">
          <span class="material-icons-round">pending_actions</span>
        </div>
      </div>
      <div class="stat-card-label">Pending Amount</div>
      <div class="stat-card-value" style="color: var(--text-warning)">${formatCurrencyCompact(stats.combinedPending)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon blue">
          <span class="material-icons-round">people</span>
        </div>
      </div>
      <div class="stat-card-label">Customers</div>
      <div class="stat-card-value">${stats.customerCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon red">
          <span class="material-icons-round">precision_manufacturing</span>
        </div>
      </div>
      <div class="stat-card-label">Wholesale Parts Cost</div>
      <div class="stat-card-value">${formatCurrencyCompact(stats.totalWholesaleCost || stats.materialStats.totalWholesaleCost)}</div>
    </div>
  `;

  // Render charts
  renderCharts(stats);
  renderRecentActivity(stats);

  // Refresh button
  document.getElementById('btn-refresh-dashboard')?.addEventListener('click', initDashboard);
}

function renderCharts(stats) {
  // Destroy existing charts
  if (revenueChart) revenueChart.destroy();
  if (statusChart) statusChart.destroy();
  if (profitChart) profitChart.destroy();

  const chartColors = {
    purple: 'rgba(99, 102, 241, 0.8)',
    purpleLight: 'rgba(99, 102, 241, 0.2)',
    green: 'rgba(16, 185, 129, 0.8)',
    greenLight: 'rgba(16, 185, 129, 0.2)',
    orange: 'rgba(245, 158, 11, 0.8)',
    blue: 'rgba(6, 182, 212, 0.8)',
    red: 'rgba(239, 68, 68, 0.8)',
    violet: 'rgba(139, 92, 246, 0.8)',
  };

  // Revenue Chart
  const revenueCtx = document.getElementById('chart-revenue');
  if (revenueCtx) {
    revenueChart = new Chart(revenueCtx, {
      type: 'bar',
      data: {
        labels: ['Projects', 'Materials'],
        datasets: [
          {
            label: 'Revenue',
            data: [stats.projectStats.totalOrderValue, stats.materialStats.totalRevenue],
            backgroundColor: [chartColors.purple, chartColors.violet],
            borderRadius: 8,
            barPercentage: 0.5,
          },
          {
            label: 'Profit',
            data: [stats.projectStats.totalProfit, stats.materialStats.totalProfit],
            backgroundColor: [chartColors.green, chartColors.green],
            borderRadius: 8,
            barPercentage: 0.5,
          },
          {
            label: 'Pending',
            data: [stats.projectStats.totalPending, stats.materialStats.totalPendingAmount],
            backgroundColor: [chartColors.orange, chartColors.orange],
            borderRadius: 8,
            barPercentage: 0.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Inter' } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: { color: '#94a3b8', font: { family: 'Inter' } },
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter' },
              callback: (v) => '₹' + v.toLocaleString('en-IN'),
            },
          },
        },
      },
    });
  }

  // Status Chart
  const statusCtx = document.getElementById('chart-status');
  if (statusCtx) {
    const sc = stats.projectStats.statusCounts;
    const statusLabels = Object.keys(sc);
    const statusValues = Object.values(sc);

    const statusColors = statusLabels.map(s => {
      const ns = normalizeStatus(s);
      const colorMap = {
        'delivered': chartColors.green,
        'completed': chartColors.blue,
        'in-assembly': chartColors.orange,
        'waiting': chartColors.red,
        'pending': chartColors.violet,
      };
      return colorMap[ns] || chartColors.purple;
    });

    statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: statusLabels.map(s => getStatusLabel(normalizeStatus(s))),
        datasets: [{
          data: statusValues,
          backgroundColor: statusColors,
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { family: 'Inter' }, padding: 16 },
          },
        },
      },
    });
  }

  // Profit Trend Chart
  const profitCtx = document.getElementById('chart-profit');
  if (profitCtx) {
    // Group by month
    const allOrders = [...stats.projectStats.orders, ...stats.materialStats.orders];
    const monthly = {};

    allOrders.forEach(o => {
      const date = o.orderDate || o.createdAt;
      if (!date) return;
      const d = new Date(date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { revenue: 0, profit: 0 };
      monthly[key].revenue += parseFloat(o.payment || o.totalPrice || 0);
      monthly[key].profit += parseFloat(o.profit || o.netProfit || 0);
    });

    const sortedMonths = Object.keys(monthly).sort();
    const monthLabels = sortedMonths.map(m => {
      const [y, mon] = m.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[parseInt(mon) - 1]} ${y}`;
    });

    profitChart = new Chart(profitCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Revenue',
            data: sortedMonths.map(m => monthly[m].revenue),
            borderColor: chartColors.purple,
            backgroundColor: chartColors.purpleLight,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: chartColors.purple,
          },
          {
            label: 'Profit',
            data: sortedMonths.map(m => monthly[m].profit),
            borderColor: chartColors.green,
            backgroundColor: chartColors.greenLight,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: chartColors.green,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Inter' } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: { color: '#94a3b8', font: { family: 'Inter' } },
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.06)' },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter' },
              callback: (v) => '₹' + v.toLocaleString('en-IN'),
            },
          },
        },
      },
    });
  }
}

async function renderRecentActivity(stats) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  const allOrders = [
    ...stats.projectStats.orders.map(o => ({
      type: 'order',
      text: `Project order: ${o.projectName || 'N/A'} — ${o.name}`,
      time: o.updatedAt || o.createdAt || o.orderDate,
      icon: 'inventory_2',
      iconClass: 'order',
    })),
    ...stats.materialStats.orders.map(o => ({
      type: 'material',
      text: `Material: ${o.materialItem || 'N/A'} — ${o.customerName}`,
      time: o.updatedAt || o.createdAt || o.orderDate,
      icon: 'shopping_cart',
      iconClass: 'material',
    })),
  ];

  // Sort by most recent
  allOrders.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  const recent = allOrders.slice(0, 8);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px">
        <p style="color: var(--text-tertiary)">No recent activity. Add some orders to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = recent.map(item => `
    <div class="activity-item">
      <div class="activity-icon ${item.iconClass}">
        <span class="material-icons-round">${item.icon}</span>
      </div>
      <div class="activity-content">
        <div class="activity-text">${item.text}</div>
        <div class="activity-time">${timeAgo(item.time)}</div>
      </div>
    </div>
  `).join('');
}
