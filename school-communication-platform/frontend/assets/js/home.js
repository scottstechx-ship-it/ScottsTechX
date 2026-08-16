/* ── MOBILE MENU TOGGLE ── */
function toggleMenu() {
  const menu = document.getElementById('mobileMenu');
  const hamburger = document.getElementById('hamburger');
  menu.classList.toggle('active');
  hamburger.classList.toggle('active');
}

// Close mobile menu when clicking a link
document.querySelectorAll('.mobile-menu a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.remove('active');
    document.getElementById('hamburger').classList.remove('active');
  });
});

// ── HERO COUNTER ANIMATION ──
function animateCounters() {
  document.querySelectorAll('.stat-num[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count);
    const suffix = el.dataset.count.includes('%') ? '%' : '';
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 60));
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = current + (target === 95 ? '%' : target === 59 ? '+' : '+');
    }, 30);
  });
}

// Intersection Observer for counter animation
const statsObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounters();
      statsObserver.disconnect();
    }
  });
}, { threshold: 0.5 });
const heroStats = document.getElementById('heroStats');
if (heroStats) statsObserver.observe(heroStats);

// ── CHAT BOT ──
const chatKnowledge = [
  { q: /admission|apply|join|register/i, a: '📋 ADMISSIONS: S.1 applications open for 2026! Visit our admissions page or call +256 700 000 000. Requirements: PLE results, birth certificate, photos, and vaccination records.' },
  { q: /fee|tuition|charge|money/i, a: '💰 FEES: Day students approx. UGX 1,200,000/term. Boarding approx. UGX 2,500,000/term. Payments accepted at school office or via mobile money. Contact accounts for payment plans.' },
  { q: /location|address|where/i, a: '📍 We\'re located in Nabitali, Jinja District, along the Jinja–Iganga highway. About 15km from Jinja town. Look for our signpost at the junction!' },
  { q: /contact|phone|email|reach/i, a: '📞 Phone: +256 700 000 000\n✉️ Email: info@kalinabiriss.ac.ug\n🏠 Office hours: Mon-Fri, 7:30am - 5:00pm' },
  { q: /uniform|dress|code/i, a: '👔 Our school colors are GREEN & GOLD. Students must wear the official Kalinabiri SS uniform. Navy skirt/trousers, green shirt/tie, gold scarf for girls. PE kit required.' },
  { q: /time|hours|schedule|day/i, a: '⏰ School runs: Mon-Fri 7:30am - 5:00pm. Boarding students have prep time 7-9pm. Saturday classes for S.4-S.6. Drop-off/pickup at main gate.' },
  { q: /subject|science|arts|commerce/i, a: '📚 We offer Science (Biology, Chemistry, Physics, Math), Arts (History, Geography, Literature, Languages), and Commercial (Economics, Accounting, Business). Electives available at S.5-S.6.' },
  { q: /teacher|staff|employ/i, a: '👨‍🏫 We have 60+ qualified teachers across all departments. Interested in joining? Send your CV to jobs@kalinabiriss.ac.ug. Currently recruiting for Chemistry and Mathematics.' },
  { q: /sport|game|football|soccer/i, a: '⚽ Our sports program includes: Football (boys), Netball (girls), Volleyball, Athletics, Basketball. Inter-class competitions held termly. Major matches on Saturdays!' },
  { q: /result|exam|performance|grade/i, a: '📊 Check the results portal for student academic reports. Overall pass rate: 95%. 80% of our students qualify for university. Top performers receive scholarships.' },
  { q: /uniform|dress|code/i, a: '👔 School uniform: Navy skirt/trousers + green shirt + gold tie. Sweater with school emblem in cold weather. PE kit: white shirt + shorts. No jewelry or artificial hair for students.' },
  { q: /library|book|read/i, a: '📖 Our library has 10,000+ volumes, computer stations, and a reading area. Open 7am-9pm for boarding students. Inter-library loans available. E-resources accessible via school network.' },
  { q: /lab|science|computer/i, a: '🔬 We have 3 fully-equipped Science labs (Physics, Chemistry, Biology), 2 Computer labs with 100+ machines, and an ICT innovation center for practical sessions.' },
  { q: /term|date|holiday|break/i, a: '📅 2026 Term Dates:\nTerm 1: Mar 2 - Apr 24\nTerm 2: May 4 - Jul 31\nTerm 3: Sep 6 - Nov 27\nMid-term breaks announced per term.' },
  { q: /exam|uneb|mock|assessment/i, a: '📝 We conduct regular assessments, mock exams for S.4 and S.6, and prepare students for UCE and UACE via UNEB. Mock exams usually in Aug (S.4) and Oct (S.6).' },
  { q: /boarding|hostel|dorm/i, a: '🏠 Boarding facilities available for both boys and girls. Spacious dorms, supervised prep sessions, feeding included. Mess hall serves balanced meals. In-substance visitation only.' },
  { q: /meal|food|feeding/i, a: '🍽️ Students receive breakfast, lunch, and supper. Special dietary needs accommodated with notice. Mess menu rotates weekly. Students may bring snacks for break time only.' },
  { q: /security|safe|guard/i, a: '🔒 Campus secured with perimeter fence, 24/7 security guards, and CCTV. Visitors sign in at gate. No unauthorized persons on campus after 8pm. Drugs and weapons strictly prohibited.' },
  { q: /medical|clinic|health|sick/i, a: '🏥 School has a sick bay with first aid trained staff. Serious cases referred to Jinja Regional Referral Hospital. Medical history forms required at enrollment. Health insurance encouraged.' },
  { q: /transport|bus|shuttle/i, a: '🚌 School bus service available for students within 20km radius (fee applies). Routes cover Jinja town, Njeru, and surrounding areas. Contact transport office for route schedule.' },
];
const defaultAnswer = '🤖 I\'m here to help! Try asking about: Admissions, Fees, Location, Contact, Uniform, Schedule, Subjects, Sports, Boarding, or Exam info. You can also call us at +256 700 000 000!';

function toggleChat() {
  document.getElementById('chatWindow').classList.toggle('open');
}
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  const messagesDiv = document.getElementById('chatMessages');
  // Add user message
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg user';
  userDiv.textContent = msg;
  messagesDiv.appendChild(userDiv);
  input.value = '';
  // Bot response
  const match = chatKnowledge.find(item => item.q.test(msg));
  const botDiv = document.createElement('div');
  botDiv.className = 'chat-msg bot';
  botDiv.textContent = match ? match.a : defaultAnswer;
  setTimeout(() => {
    messagesDiv.appendChild(botDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, 600);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function toggleChat() {
  document.getElementById('chatWindow').classList.toggle('open');
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

// Scroll-based nav highlight
window.addEventListener('scroll', () => {
  const nav = document.getElementById('desktopNav');
  if (window.scrollY > 50) {
    nav.style.background = 'rgba(13,43,26,0.98)';
    nav.style.boxShadow = '0 2px 30px rgba(0,0,0,0.3)';
  } else {
    nav.style.background = 'rgba(13,43,26,0.97)';
    nav.style.boxShadow = '0 2px 30px rgba(0,0,0,0.2)';
  }
});

// Intersection Observer for fade-up animations
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('fade-up');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.card, .academic-card, .activity-card, .testimonial-card, .vmv-card, .news-card').forEach(el => {
  el.style.opacity = '0';
  fadeObserver.observe(el);
});