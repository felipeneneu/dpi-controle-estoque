---
name: wpf-patterns
description: WPF MVVM patterns, XAML best practices, bindings, templates, dependency properties, and control design for native Windows desktop UIs. Use when building or reviewing WPF/XAML code. NOT for WinForms, NOT for UWP/WinUI (different APIs).
when_to_use: "When writing or reviewing WPF/XAML code. When designing desktop UI with MVVM. NOT for Avalonia (use avalonia-patterns), NOT for web (use frontend-design)."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
version: 1.0.0
---

# wpf-patterns

## Filosofia MVVM
- **View:** Deve conter apenas a definição visual (XAML) e código estritamente relacionado à manipulação da interface (animações visuais ou comportamentos muito específicos de view). Não deve conter lógica de negócio.
- **ViewModel:** Mantém o estado da view e a lógica de apresentação. Não deve conhecer NENHUM tipo de interface de usuário (como `Window`, `Button`, `MessageBox`). Deve interagir com a view exclusivamente através de Data Binding e Commands.
- **Model:** A lógica de negócio e os dados puros.

## Estrutura de projeto
Organize o projeto seguindo a estrutura padrão:
- `Views/`: Telas e componentes visuais (`.xaml` e `.xaml.cs`).
- `ViewModels/`: Classes que orquestram os dados e comandos (`.cs`).
- `Models/`: Dados de negócio e lógica de backend.
- `Resources/`: Dicionários de recursos, imagens, ícones.
- `Services/`: Serviços de infraestrutura (acesso a banco, abstração de caixas de diálogo).

## Data binding
- Utilize `{Binding Propriedade}` juntamente com `INotifyPropertyChanged` para manter a View atualizada.
- Para inputs que precisam atualizar o ViewModel em tempo real (como caixas de texto), use `{Binding Path=..., Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}`.
- **IValueConverter:** Útil para formatações simples (ex: `BooleanToVisibilityConverter`).
- **IMultiValueConverter:** Use para vincular propriedades baseadas em múltiplos fatores do ViewModel.

## Commands
- Evite eventos do tipo `Click` no Code-Behind. Utilize a interface `ICommand`.
- Recomendamos o uso de `RelayCommand` ou `AsyncRelayCommand` do pacote `CommunityToolkit.Mvvm`.
- Implemente `CanExecute` para definir quando uma ação está disponível (ex: habilitar/desabilitar botões automaticamente).
- Quando o estado de `CanExecute` mudar baseado em uma propriedade do ViewModel, certifique-se de chamar `RaiseCanExecuteChanged` (ou o equivalente `NotifyCanExecuteChanged`).

## Templates
- **DataTemplate:** Sempre que renderizar listas ou coleções de objetos de negócio (ex: `ItemsControl`, `ListBox`), use `DataTemplate`. Evite usar `UserControl` inline dentro de controles de repetição.
- **ControlTemplate:** Quando precisar alterar radicalmente a estrutura visual de um controle padrão (como um `Button` ou `Slider`), crie um `ControlTemplate`.
- **DataTemplateSelector:** Ideal para renderizar itens de forma diferente numa mesma lista, com base no tipo ou estado do dado.

## Resources
- Dicionários (`ResourceDictionary`) devem ser centralizados, de preferência com referências em nível de `App.xaml` ou por módulos focados.
- **StaticResource:** Use para referenciar recursos estáticos que não vão mudar em tempo de execução (cores base, tamanhos, templates padrão). Melhora a performance.
- **DynamicResource:** Use apenas quando necessário, por exemplo, para temas que podem ser alterados pelo usuário em tempo de execução.

## Estilos
- Encapsule propriedades comuns num `<Style>`.
- Use a propriedade `BasedOn` para herdar estilos e evitar duplicação (ex: `BasedOn="{StaticResource BotaoBase}"`).
- Utilize **Triggers** (`Trigger`, `DataTrigger`, `MultiDataTrigger`) para criar regras de interface responsivas ao estado.
- Prefira usar **Visual States** (`VisualStateManager`) para estados complexos e transições animadas.

## Dependency Properties
- Ao criar controles customizados (`UserControl` ou `CustomControl`), crie **Dependency Properties** no lugar de propriedades comuns para expor atributos. Isso garante que a propriedade suporte Data Binding, Animação e Estilos externamente.

## Validação
- Implemente a interface `INotifyDataErrorInfo` em seus ViewModels para expor erros de validação na View.
- Utilize validações assíncronas quando necessitar acessar APIs ou banco de dados.
- Opcionalmente, pode ser usado `ValidationRules` no XAML, embora concentrar no ViewModel seja mais coeso.

## Anti-patterns
- ❌ Código de negócio, consultas SQL ou lógicas de API no `MainWindow.xaml.cs`.
- ❌ Uso de `Click +=` ao invés de Binding com `Command`.
- ❌ Invocação de `MessageBox.Show()` ou outras abstrações de UI dentro do ViewModel (injete um serviço de diálogo (`IDialogService`) em vez disso).
- ❌ Acesso direto a controles de UI (ex: `myButton.IsEnabled = true;`) dentro de um ViewModel.
- ❌ Uso abusivo de `DynamicResource` quando as cores e propriedades não mudam em tempo real.
- ❌ Carregar milhares de itens em um `StackPanel` através de `ItemsControl` (sem virtualização de UI). Use `VirtualizingStackPanel` ou controles nativos que já o adotem como o `ListView` e `DataGrid`.
