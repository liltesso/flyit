const gemini = require('./gemini');

/**
 * POST /api/nutrition/recipe
 */
async function generateRecipe(req, res) {
    const { ingredients, weight, goal, activityLevel } = req.body;
    if (!ingredients) return res.status(400).json({ ok: false, error: 'Вкажіть принаймні один інгредієнт для генерації рецепту' });
    
    const goalMap = {
        bulk: 'набір м\'язової маси',
        cut: 'сушка/схуднення',
        maintain: 'підтримка поточної ваги'
    };
    
    const actMap = {
        low: 'низький (сидячий спосіб життя)',
        medium: 'середній (3-4 тренування на тиждень)',
        high: 'високий (активні щоденні тренування)'
    };
    
    const goalUkr = goalMap[goal] || 'підтримка поточної ваги';
    const actUkr = actMap[activityLevel] || 'середній';
    
    try {
        const result = await gemini.callGemini(
            `Ти — суворий нутриціолог-тренер. Користувач має такі продукти: [${ingredients}].Його поточна вага: ${weight || 75} кг. Його ціль: ${goalUkr}. Рівень активності: ${actUkr}.

Згенеруй ОДИН покроковий рецепт з цих продуктів, щоб він максимально відповідав його цілі.
Обов'язково додай:
1) Назву страви.
2) Покрокову інструкцію приготування.
3) Точний розрахунок КБЖУ (калорії, білки, жири, вуглеводи) на порцію.
4) Якщо білка замало для його цілі (менше 30г на порцію при наборі маси), напиши ЖОРСТКУ рекомендацію, що конкретно треба докупити.

Відповідай ТІЛЬКИ JSON:
{
  "name": "назва страви",
  "steps": ["крок 1", "крок 2", "крок 3"],
  "macros": {
    "calories": число,
    "protein": число,
    "fat": число,
    "carbs": число
  },
  "warning": "жорстка рекомендація або null"
}`
        );
        
        res.json({ ok: true, recipe: result });
    } catch(err) {
        res.status(500).json({ ok: false, error: 'AI Error: ' + err.message });
    }
}

module.exports = {
    generateRecipe
};
