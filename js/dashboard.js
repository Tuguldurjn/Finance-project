import { supabase } from './supabase.js'

const transactionForm = document.getElementById('transaction-form');
const txTypeInput = document.getElementById('tx-type');
const txCategoryInput = document.getElementById('tx-category');
const txAmountInput = document.getElementById('tx-amount');
const txDateInput = document.getElementById('tx-date');
const txDescInput = document.getElementById('tx-desc');
const btnLogout = document.getElementById('btn-logout');

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'index.html';
        return;
    }

    const emailDisplay = document.getElementById('user-email');
    const btnLogout = document.getElementById('btn-logout');

    if (emailDisplay) emailDisplay.textContent = user.email;

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    await fetchTransactions();
    await fetchBadges();
    await fetchBudgets();
});

transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = txTypeInput.value;
    const category = txCategoryInput.value;
    const amount = parseFloat(txAmountInput.value);
    const date = txDateInput.value;
    const description = txDescInput.value;

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        alert("Сешн дууссан байна. Дахин нэвтэрнэ үү!");
        window.location.href = 'index.html';
        return;
    }

// --- (Формын утгуудыг авсны дараа, Insert хийхийн өмнөх хэсэг) ---
    
    // Хэрэв хийж буй гүйлгээ нь ЗАРЛАГА бол ТӨСӨВ ХЭТЭРСЭН ЭСЭХИЙГ ШАЛГАНА
    if (type === 'expense') {
        // Тухайн гүйлгээний огнооноос Жил-Сарыг салгаж авна (Жишээ нь: "2026-06-08" -> "2026-06")
        const currentMonthYear = date.substring(0, 7);

        // Supabase-ээс энэ сард, энэ ангилалд тогтоосон төсөв байгаа эсэхийг хайх
        const { data: budgetData } = await supabase
            .from('budgets')
            .select('limit_amount')
            .eq('user_id', user.id)
            .eq('category', category)
            .eq('month_year', currentMonthYear)
            .maybeSingle(); // Олдвол ганцхан объект авна, олдохгүй бол null

        // Хэрэв энэ сард энэ ангилалд зориулсан төсөв олдвол цааш шалгана
        if (budgetData) {
            const limitAmount = budgetData.limit_amount;

            // Энэ сард, энэ ангилалд урьд нь хийгдсэн бүх зарлагуудын нийлбэрийг Supabase-с татах
            const { data: pastExpenses } = await supabase
                .from('transactions')
                .select('amount, date')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .eq('category', category);
            
            // Энэ сард хамаарах зарлагуудыг шүүж нийлбэрийг олно
            let totalPastExpense = 0;
            if (pastExpenses) {
                pastExpenses.forEach(tx => {
                    // Гүйлгээ бүрийн огноо нь энэ сард хамааралтай эсэхийг шалгах
                    if (tx.date && tx.date.substring(0, 7) === currentMonthYear) {
                        totalPastExpense += tx.amount;
                    }
                });
            }

            // Хуучин зарлагууд дэар ОДООНЫ ШИНЭ зарлагын дүнг нэмээд лимитээс давж байгааг шалгах
            if (totalPastExpense + amount > limitAmount) {
                const currentTotal = totalPastExpense + amount;
                // Хэрэглэгчээс зөвшөөрөл авна
                const proceed = confirm(
                    `АНХААРУУЛГА!\n\nТаны ${currentMonthYear} сарын "${category}" ангиллын төсвийн хязгаар: ${limitAmount.toLocaleString()} ₮\nОдоогийн нийт зарцуулалт: ${currentTotal.toLocaleString()} ₮ болох гэж байна.\n\nТөсөв хэтрүүлж гүйлгээг үргэлжлүүлэх үү?`
                );
                
                if (!proceed) {
                    return; // Хэрэв хэрэглэгч "Цуцлах" дээр дарвал гүйлгээг хадгалахгүй зогсооно!
                }
            }
        }
    }

    // Supabase руу шинэ мөр өгөгдөл нэмэх (Insert) үйлдэл
    const { data, error } = await supabase
        .from('transactions') // Хэрэглэх хүснэгтийн нэр
        .insert([
            {
                user_id: user.id,        // UUID
                type: type,              // 'орлого' эсвэл 'зарлага'
                category: category,      // 'Хоол хүнс', 'Цалин орлого' гэх мэт текст
                amount: amount,          // Мөнгөн дүн (Тоо)
                description: description,// Дэлгэрэнгүй тайлбар
                date: date               // Сонгосон огноо (YYYY-MM-DD)
            }
        ])
        .select(); // Хадгалагдсан өгөгдлийг хариу болгож буцааж авах

    if (error) {
        alert("Гүйлгээг хадгалахад алдаа гарлаа: " + error.message);
        console.error("Алдааны дэлгэрэнгүй:", error);
    } else {
        alert("Гүйлгээ амжилттай бүртгэгдлээ!");

        transactionForm.reset();

        await checkTransactionBadges(user.id);

        await fetchTransactions();
        await fetchBadges();
    }
});

// Өгөгдлийн сангаас гүйлгээ уншиж, хүснэгтэд харуулах функц
async function fetchTransactions() {
    // Нэвтэрсэн хэрэглэгчийг авах
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Supabase-с зөвхөн энэ хэрэглэгчийн гүйлгээнүүдийг огноогоор нь жагсааж авах
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*') // Бүх баганыг уншиж авна
        .eq('user_id', user.id) // Зөвхөн энэ хэрэглэгчийнх гэсэн шүүлтүүр
        .order('date', { ascending: false }); // Хамгийн шинэ гүйлгээг дээр нь гаргана

    if (error) {
        console.error("Гүйлгээ уншихад алдаа гарлаа:", error.message);
        return;
    }

    let totalIncome = 0;
    let totalExpense = 0;

    // Ирсэн бүх гүйлгээнүүдийг нэг нэгээр нь шалгаж, орлого зарлагыг нэмнэ
    transactions.forEach(tx => {
        if (tx.type === 'income') {
            totalIncome += tx.amount;  // Хэрэв орлого бол Нийт Орлого дээр нэмнэ
        } else if (tx.type === 'expense') {
            totalExpense += tx.amount; // Хэрэв зарлага бол Нийт зарлага дээр нэмнэ
        }
    });

    const totalBalance = totalIncome - totalExpense;

    // Бодсон дүнг HTML карт руу бичих
    document.getElementById('total-balance').textContent = `${totalBalance.toLocaleString()} ₮`;
    document.getElementById('total-income').textContent = `${totalIncome.toLocaleString()} ₮`;
    document.getElementById('total-expense').textContent = `${totalExpense.toLocaleString()} ₮`;

    // HTML хүснэгтэд гүйлгээнүүдийг үзүүлэх функцыг дуудаж, өгөгдлийг дамжуулна
    renderTransactions(transactions);
}

function renderTransactions(transactions) {
    const listContainer = document.getElementById('transaction-list');
    
    // Хэрэв ямар ч гүйлгээ байхгүй бол хоосон байна гэсэн бичиг харуулна
    if (transactions.length === 0) {
        listContainer.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fa-solid fa-folder-open fs-3 d-block mb-2"></i>
                    Одоогоор ямар нэгэн гүйлгээ бүртгэгдээгүй байна.
                </td>
            </tr>
        `;
        return;
    }

    // Хүснэгтийг цэвэрлээд, датаг мөр мөрөөр нь залгах
    let htmlContent = '';
    
    transactions.forEach(tx => {
        // Орлого бол ногоон +, Зарлага бол улаан - тэмдэг тавих логик
        const isIncome = tx.type === 'income';
        const badgeColor = isIncome ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const typeText = isIncome ? 'Орлого' : 'Зарлага';
        const amountSign = isIncome ? '+' : '-';
        const amountColor = isIncome ? 'text-success' : 'text-danger';

        htmlContent += `
            <tr>
                <td>${tx.date}</td>
                <td><span class="badge bg-light text-dark shadow-sm border">${tx.category}</span></td>
                <td class="text-secondary fw-medium">${tx.description}</td>
                <td><span class="badge ${badgeColor}">${typeText}</span></td>
                <td class="text-end fw-bold ${amountColor}">${amountSign}${tx.amount.toLocaleString()} ₮</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteTransaction('${tx.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    // Бэлдсэн  HTML мөрүүдээ хүснэгтийн tbody руу шууд шахаж оруулна
    listContainer.innerHTML = htmlContent;
}

window.deleteTransaction = async function(id) {
    const confirmDelete = confirm("Та энэ гүйлгээг устгахдаа итгэлтэй байна уу?");
    
    if (!confirmDelete) {
        return;
    }

    try {
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id);

        if (error) {
            throw error;
        }

        alert("Гүйлгээ амжилттай устгагдлаа.");

        await fetchTransactions();
        await fetchBadges();

    } catch (error) {
        alert("Гүйлгээ устгахад алдаа гарлаа: " + error.message);
        console.error("Устгах үеийн алдаа:", error);
    }
}

const btnLogout = document.getElementById('btn-logout');

// Товч дээр дарах үед ажиллах Event Listener залгах
btnLogout.addEventListener('click', async () => {
    // Хэрэглэгчээс үнэхээр гарах эсэхийг нь лавлаж асууна
    const confirmLogout = confirm("Та системээс гарахдаа итгэлтэй байна уу?");
    
    if (!confirmLogout) {
        return; // Хэрэв цуцалбал гарах үйлдлийг зогсооно
    }

    try {
        // Supabase-ийн системээс бүрмөсөн гаргах, сешн устгах тушаал
        const { error } = await supabase.auth.signOut();

        if (error) {
            throw error; // Хэрэв алдаа гарвал catch хэсэг рүү шиднэ
        }

        // Амжилттай гарсан тул нэвтрэх хуудас руу шууд шилжүүлнэ
        window.location.href = 'index.html';

    } catch (error) {
        alert("Системээс гарахад алдаа гарлаа: " + error.message);
        console.error("Logout алдаа:", error);
    }
});



// --- ТӨСӨВ ТОГТООХ ФОРМЫН ЛОГИК ---
const budgetForm = document.getElementById('budget-form');
const budgetCategoryInput = document.getElementById('budget-category');
const budgetAmountInput = document.getElementById('budget-amount');
const budgetMonthInput = document.getElementById('budget-month');

budgetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = budgetCategoryInput.value;
    const limitAmount = parseFloat(budgetAmountInput.value);
    const monthYear = budgetMonthInput.value; 

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("Сешн дууссан байна!");
        return;
    }

    const { error } = await supabase
        .from('budgets')
        .insert([
            {
                user_id: user.id,
                category: category,
                limit_amount: limitAmount,
                month_year: monthYear
            }
        ]);

    if (error) {
        alert("Төсөв тогтооход алдаа гарлаа: " + error.message);
    } else {
        alert(`${monthYear} сарын ${category} ангилалд төсөв амжилттай тогтоогдлоо!`);
        budgetForm.reset();

        await checkBudgetBadges(user.id);
        await fetchBadges();

        const offcanvasElement = document.getElementById('offcanvasBudget');
        const instance = bootstrap.Offcanvas.getInstance(offcanvasElement) || new bootstrap.Offcanvas(offcanvasElement);
        
        instance.hide();
        if (typeof fetchBudgets === 'function') fetchBudgets();
    }
});


// Хэрэглэгчийн тогтоосон төсвүүдийг уншиж, Offcanvas доор жагсаах функц
async function fetchBudgets() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: budgets, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('month_year', { ascending: false });

    if (error) {
        console.error("Төсөв уншихад алдаа гарлаа:", error.message);
        return;
    }

    const budgetsContainer = document.getElementById('current-budgets-list');
    
    if (!budgets || budgets.length === 0) {
        budgetsContainer.innerHTML = `
            <h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>
            <div class="text-center py-3 text-muted small bg-light rounded">Одоогоор төсөв тогтоогоогүй байна.</div>
        `;
        return;
    }

    let htmlContent = `<h6 class="fw-bold text-dark mb-3">Одоогийн тогтоосон төсвүүд:</h6>`;
    
    budgets.forEach(b => {
        htmlContent += `
            <div class="card p-2 mb-2 bg-light border-0 shadow-sm">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold small text-dark">${b.category}</span>
                        <span class="text-muted mx-1">•</span>
                        <span class="small text-secondary">${b.month_year}</span>
                    </div>
                    <span class="fw-bold text-primary small">${b.limit_amount.toLocaleString()} ₮</span>
                </div>
            </div>
        `;
    });

    budgetsContainer.innerHTML = htmlContent;
}

async function awardBadge(userId, badgeName) {
    const { data: existingBadge } = await supabase
        .from('badges')
        .select('*')
        .eq('user_id', userId)
        .eq('badge_name', badgeName)
        .maybeSingle();

    if (existingBadge) return;

    const { error } = await supabase
        .from('badges')
        .insert([
            {
                user_id: userId,
                badge_name: badgeName,
                awarded_at: new Date().toISOString()
            }
        ]);

    if (!error) {
        alert(`Шинэ шагнал авлаа!\n${badgeName}`);
        fetchBadges();
    }
}

async function fetchBadges() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: badges } = await supabase
        .from('badges')
        .select('*')
        .eq('user_id', user.id);

    renderBadges(badges || []);
}

function renderBadges(badges) {
    const container =
        document.getElementById('badges-container');
    if (!container) return;
    if (badges.length === 0) {

        container.innerHTML =
            '<p class="text-muted">Шагнал байхгүй байна.</p>';

        return;
    }
    let html = '';
    badges.forEach(badge => {

        html += `
            <span class="badge bg-warning text-dark fs-6 me-2 mb-2">
                 ${badge.badge_name}
            </span>
        `;
    });
    container.innerHTML = html;
}

async function checkTransactionBadges(userId) {

    const { count: totalTransactions } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (totalTransactions >= 1) {
        await awardBadge(userId, 'Анхны алхам');
    }

    if (totalTransactions >= 10) {
        await awardBadge(userId, 'Идэвхтэй хэрэглэгч');
    }

    if (totalTransactions >= 50) {
        await awardBadge(userId, 'Үнэнч хэрэглэгч');
    }

    if (totalTransactions >= 100) {
        await awardBadge(userId, 'Санхүүгийн мастер');
    }

    const { count: incomeCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'income');

    if (incomeCount >= 1) {
        await awardBadge(userId, 'Орлого бүртгэгч');
    }
}

async function checkBudgetBadges(userId) {

    const { count: budgetCount } = await supabase
        .from('budgets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (budgetCount >= 1) {
        await awardBadge(userId, 'Төлөвлөгч');
    }

    const { data: budgets } = await supabase
        .from('budgets')
        .select('category')
        .eq('user_id', userId);

    if (budgets) {

        const uniqueCategories =
            [...new Set(budgets.map(b => b.category))];

        if (uniqueCategories.length >= 3) {
            await awardBadge(userId, 'Төсвийн мастер');
        }
    }

    await checkDisciplineBadge(userId);
}

async function checkDisciplineBadge(userId) {

    const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId);

    if (!budgets || budgets.length === 0) return;

    let qualifies = false;

    for (const budget of budgets) {

        const { data: expenses } = await supabase
            .from('transactions')
            .select('amount, date')
            .eq('user_id', userId)
            .eq('type', 'expense')
            .eq('category', budget.category);

        let totalExpense = 0;

        if (expenses) {
            expenses.forEach(tx => {
                totalExpense += Number(tx.amount);
            });
        }

        if (totalExpense <= Number(budget.limit_amount)) {
            qualifies = true;
        }
    }

    if (qualifies) {
        await awardBadge(userId, 'Сахилга баттай');
    }
}