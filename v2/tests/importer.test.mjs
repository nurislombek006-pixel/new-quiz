import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestions} from '../public/importer.js';
test('Parses # as correct answer and recognizes Russian question template',()=>{
  const t='1. Столица Узбекистана?\na) Москва\nb) Ташкент#\nc) Бишкек\nd) Пекин';
  const r=parseQuestions(t,'География');
  assert.equal(r.questions.length,1);
  assert.equal(r.errors.length,0);
  assert.equal(r.questions[0].correct_index,1);
  assert.equal(r.questions[0].options[1],'Ташкент');
  assert.equal(r.questions[0].topic,'География');
});
test('Splits topics and questions',()=>{
  const t='Тема: Города\n1. Столица Франции?\na) Париж#\nb) Киев\nc) Рим\nd) Лондон\nТема: Экономика\n2. Что означает ВВП?\na) Внутренний валовой продукт\nb) Валовой внутренний продукт#\nc) Валютный валовой платёж\nd) Внешняя валюта';
  const r=parseQuestions(t);
  assert.equal(r.questions.length,2);
  assert.deepEqual(r.questions.map(x=>x.topic),['Города','Экономика']);
});
test('Rejects missing or multiple correct answers',()=>{
  const t='1. Неправильный вопрос?\na) 1\nb) 2\nc) 3\nd) 4';
  const r=parseQuestions(t);
  assert.equal(r.questions.length,0);
  assert.ok(r.errors.length>0);
});
